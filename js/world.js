        // Membuat Lingkungan Jalan Tol
        function createEnvironment() {
            const controlPoints = [];
            const pointCount = 1000;
            for (let i = 0; i < pointCount; i++) {
                const angle = i / pointCount * Math.PI * 2;
                const distanceFromBridge = Math.min(angle, Math.PI * 2 - angle);
                const rise = THREE.MathUtils.clamp(1 - distanceFromBridge / 1.8, 0, 1);
                const height = 8 * rise * rise * (3 - 2 * rise);
                controlPoints.push(new THREE.Vector3(
                    125 * Math.sin(angle),
                    height,
                    80 * Math.sin(2 * angle)
                ));
            }

            const baseCurve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal');
            let horizontalScale = 4000 / baseCurve.getLength();
            for (let i = 0; i < 4; i++) {
                const scaledPoints = controlPoints.map(point => new THREE.Vector3(
                    point.x * horizontalScale,
                    point.y,
                    point.z * horizontalScale
                ));
                trackCurve = new THREE.CatmullRomCurve3(scaledPoints, true, 'centripetal');
                horizontalScale *= 4000 / trackCurve.getLength();
            }
            const finalPoints = controlPoints.map(point => new THREE.Vector3(
                point.x * horizontalScale,
                point.y,
                point.z * horizontalScale
            ));
            trackCurve = new THREE.CatmullRomCurve3(finalPoints, true, 'centripetal');
            trackLength = trackCurve.getLength();
            const roadPoints = trackCurve.getSpacedPoints(trackResolution);
            const roadPositions = [];
            const roadUvs = [];
            const roadIndices = [];
            roadSegments = [];

            roadPoints.forEach((point, i) => {
                const before = roadPoints[i === 0 ? roadPoints.length - 2 : i - 1];
                const after = roadPoints[Math.min(roadPoints.length - 1, i + 1)];
                const dx = after.x - before.x;
                const dz = after.z - before.z;
                const length = Math.hypot(dx, dz) || 1;
                const nx = -dz / length;
                const nz = dx / length;
                roadPositions.push(
                    point.x - nx * 8, point.y, point.z - nz * 8,
                    point.x + nx * 8, point.y, point.z + nz * 8
                );
                const alongTrack = i / trackResolution;
                roadUvs.push(0, alongTrack, 1, alongTrack);
                if (i < roadPoints.length - 1) {
                    const a = i * 2;
                    roadIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
                    roadSegments.push({ start: point, end: roadPoints[i + 1], index: i });
                }
            });

            const roadGeometry = new THREE.BufferGeometry();
            roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
            roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
            roadGeometry.setIndex(roadIndices);
            roadGeometry.computeVertexNormals();
            const roadMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.8,
                side: THREE.DoubleSide
            });
            const roadTextureLoader = new THREE.TextureLoader();
            const configureRoadTexture = (texture, isColorMap) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(2, trackLength / 8);
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                if (isColorMap) texture.encoding = THREE.sRGBEncoding;
            };
            const roadTexturesReady = Promise.all([
                new Promise((resolve, reject) => {
                    roadTextureLoader.load(
                        'assets/asphalt_02_diff_2k.jpg',
                        resolve,
                        undefined,
                        () => reject(new Error('Gagal memuat tekstur warna aspal.'))
                    );
                }),
                new Promise((resolve, reject) => {
                    roadTextureLoader.load(
                        'assets/asphalt_02_rough_2k.jpg',
                        resolve,
                        undefined,
                        () => reject(new Error('Gagal memuat tekstur kekasaran aspal.'))
                    );
                })
            ]).then(([texture, roughnessTexture]) => {
                const canvas = document.createElement('canvas');
                canvas.width = texture.image.width;
                canvas.height = texture.image.height;
                const context = canvas.getContext('2d');
                if (!context) {
                    throw new Error('Gagal menyiapkan tekstur warna aspal.');
                }
                context.drawImage(texture.image, 0, 0);
                context.globalAlpha = 0.9;
                context.fillStyle = '#555555';
                context.fillRect(0, 0, canvas.width, canvas.height);

                const softenedTexture = new THREE.CanvasTexture(canvas);
                configureRoadTexture(softenedTexture, true);
                roadMaterial.map = softenedTexture;
                configureRoadTexture(roughnessTexture, false);
                roadMaterial.roughnessMap = roughnessTexture;
                roadMaterial.needsUpdate = true;
                texture.dispose();
            });
            const road = new THREE.Mesh(
                roadGeometry,
                roadMaterial
            );
            road.receiveShadow = true;
            scene.add(road);

            // Garis lajur yang mengikuti lengkungan jalan (3 lajur proporsional selebar 4,8 m: -7,2..-2,4 | -2,4..2,4 | 2,4..7,2).
            [-2.4, 2.4].forEach(offset => {
                const linePoints = [];
                for (let i = 0; i <= trackResolution; i++) {
                    const t = i / trackResolution;
                    const point = trackCurve.getPointAt(t);
                    const tangent = trackCurve.getTangentAt(t);
                    linePoints.push(new THREE.Vector3(
                        point.x - tangent.z * offset,
                        point.y + 0.06,
                        point.z + tangent.x * offset
                    ));
                }
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
                const line = new THREE.Line(
                    lineGeometry,
                    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 7, gapSize: 6 })
                );
                line.computeLineDistances();
                scene.add(line);
            });

            // Garis bahu jalan solid di tepi kiri dan kanan tol (±7,2 m dari tengah, menyisakan 0,8 m tepi luar).
            const shoulderLineMaterial = new THREE.LineBasicMaterial({ color: 0xffcc33 });
            [-7.2, 7.2].forEach(offset => {
                const shoulderPoints = [];
                for (let i = 0; i <= trackResolution; i++) {
                    const t = i / trackResolution;
                    const point = trackCurve.getPointAt(t);
                    const tangent = trackCurve.getTangentAt(t);
                    shoulderPoints.push(new THREE.Vector3(
                        point.x - tangent.z * offset,
                        point.y + 0.055,
                        point.z + tangent.x * offset
                    ));
                }
                const shoulderLine = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(shoulderPoints),
                    shoulderLineMaterial
                );
                scene.add(shoulderLine);
            });

            // Pembatas mengikuti sisi luar jalan.
            const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85 });
            [-8.5, 8.5].forEach(offset => {
                const barrierPoints = [];
                for (let i = 0; i < trackResolution; i++) {
                    const t = i / trackResolution;
                    const point = trackCurve.getPointAt(t);
                    const tangent = trackCurve.getTangentAt(t);
                    barrierPoints.push(new THREE.Vector3(
                        point.x - tangent.z * offset,
                        point.y + 0.55,
                        point.z + tangent.x * offset
                    ));
                }
                const barrierCurve = new THREE.CatmullRomCurve3(barrierPoints, true, 'centripetal');
                const barrier = new THREE.Mesh(
                    new THREE.TubeGeometry(barrierCurve, trackResolution, 0.48, 8, true),
                    barrierMaterial
                );
                barrier.castShadow = true;
                scene.add(barrier);
            });

            // Lampu Jalan Tol (PJU) menggunakan InstancedMesh agar ringan.
            const streetLightCount = 72;
            const totalLamps = streetLightCount * 2;
            const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.2, 8);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b5360, roughness: 0.65, metalness: 0.6 });
            const armGeo = new THREE.BoxGeometry(2.4, 0.14, 0.14);
            const lampGeo = new THREE.BoxGeometry(0.95, 0.14, 0.42);
            const lampMat = new THREE.MeshBasicMaterial({ color: 0xffdfa0 });
            const poleInstances = new THREE.InstancedMesh(poleGeo, poleMat, totalLamps);
            const armInstances = new THREE.InstancedMesh(armGeo, poleMat, totalLamps);
            const lampInstances = new THREE.InstancedMesh(lampGeo, lampMat, totalLamps);
            const lampDummy = new THREE.Object3D();
            let instanceIndex = 0;

            for (let i = 0; i < streetLightCount; i++) {
                const t = i / streetLightCount;
                const point = trackCurve.getPointAt(t);
                const tangent = trackCurve.getTangentAt(t);
                const yaw = Math.atan2(-tangent.x, -tangent.z);
                [-9.3, 9.3].forEach(sideOffset => {
                    const sideSign = Math.sign(sideOffset);
                    const px = point.x - tangent.z * sideOffset;
                    const pz = point.z + tangent.x * sideOffset;

                    lampDummy.position.set(px, point.y + 3.6, pz);
                    lampDummy.rotation.set(0, yaw, 0);
                    lampDummy.updateMatrix();
                    poleInstances.setMatrixAt(instanceIndex, lampDummy.matrix);

                    const armX = px + tangent.z * (sideSign * 1.1);
                    const armZ = pz - tangent.x * (sideSign * 1.1);
                    lampDummy.position.set(armX, point.y + 7.1, armZ);
                    lampDummy.updateMatrix();
                    armInstances.setMatrixAt(instanceIndex, lampDummy.matrix);

                    const bulbX = px + tangent.z * (sideSign * 2.1);
                    const bulbZ = pz - tangent.x * (sideSign * 2.1);
                    lampDummy.position.set(bulbX, point.y + 6.96, bulbZ);
                    lampDummy.updateMatrix();
                    lampInstances.setMatrixAt(instanceIndex, lampDummy.matrix);

                    instanceIndex += 1;
                });
            }
            scene.add(poleInstances);
            scene.add(armInstances);
            scene.add(lampInstances);

            // Rambu Portal Tol Hijau khas Indonesia.
            const gantrySpecs = [
                { t: 0.16, title: 'TOL DALAM KOTA', subtitle: 'SEMANGGI  ·  KUNINGAN' },
                { t: 0.41, title: 'CAWANG  ·  CIKAMPEK', subtitle: 'LAJUR KANAN KHUSUS MENDAHULUI' },
                { t: 0.66, title: 'TOMANG  ·  SLIPI', subtitle: 'BATAS KECEPATAN 80 KM/J' },
                { t: 0.90, title: 'GROGOL  ·  BANDARA', subtitle: 'JAGA JARAK AMAN KENDARAAN' }
            ];
            const gantrySteelMat = new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.6, metalness: 0.7 });
            gantrySpecs.forEach(spec => {
                const point = trackCurve.getPointAt(spec.t);
                const tangent = trackCurve.getTangentAt(spec.t);
                const yaw = Math.atan2(-tangent.x, -tangent.z);
                const gantryGroup = new THREE.Group();
                gantryGroup.position.set(point.x, point.y, point.z);
                gantryGroup.rotation.y = yaw;

                [-9.4, 9.4].forEach(sideX => {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 10), gantrySteelMat);
                    post.position.set(sideX, 3.8, 0);
                    gantryGroup.add(post);
                });
                const beam = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.35, 0.35), gantrySteelMat);
                beam.position.set(0, 7.45, 0);
                gantryGroup.add(beam);

                const signCanvas = document.createElement('canvas');
                signCanvas.width = 1024;
                signCanvas.height = 256;
                const ctx = signCanvas.getContext('2d');
                ctx.fillStyle = '#0c6b3b';
                ctx.fillRect(0, 0, signCanvas.width, signCanvas.height);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 10;
                ctx.strokeRect(12, 12, signCanvas.width - 24, signCanvas.height - 24);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = 'bold 64px "Segoe UI", sans-serif';
                ctx.fillText(spec.title, signCanvas.width / 2, 108);
                ctx.fillStyle = '#ffd54f';
                ctx.font = 'bold 38px "Segoe UI", sans-serif';
                ctx.fillText(spec.subtitle, signCanvas.width / 2, 186);

                const signTexture = new THREE.CanvasTexture(signCanvas);
                const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
                const signBoard = new THREE.Mesh(new THREE.BoxGeometry(11.6, 2.7, 0.18), [
                    gantrySteelMat, gantrySteelMat, gantrySteelMat, gantrySteelMat, signMat, signMat
                ]);
                signBoard.position.set(0, 6.9, 0);
                gantryGroup.add(signBoard);
                scene.add(gantryGroup);
            });

            // Pilar penyangga di bawah bagian flyover.
            const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
            [0.105, 0.145, 0.855, 0.895].forEach(t => {
                const point = trackCurve.getPointAt(t);
                const height = Math.max(0.8, point.y - 0.25);
                const pillar = new THREE.Mesh(
                    new THREE.BoxGeometry(2.5, height, 2.5),
                    pillarMaterial
                );
                pillar.position.set(point.x, height / 2 - 0.35, point.z);
                pillar.castShadow = true;
                scene.add(pillar);
            });

            // Siluet Gedung Kota di luar area lintasan tol.
            const buildingCanvas = document.createElement('canvas');
            buildingCanvas.width = 256;
            buildingCanvas.height = 512;
            const bCtx = buildingCanvas.getContext('2d');
            bCtx.fillStyle = '#111624';
            bCtx.fillRect(0, 0, 256, 512);
            for (let row = 12; row < 500; row += 20) {
                for (let col = 10; col < 246; col += 18) {
                    const lit = ((row * 31 + col * 17) % 11) < 4;
                    if (lit) {
                        bCtx.fillStyle = ((row + col) % 3 === 0) ? '#ffe099' : '#9ed4ff';
                        bCtx.fillRect(col, row, 10, 11);
                    }
                }
            }
            const buildingTexture = new THREE.CanvasTexture(buildingCanvas);
            buildingTexture.wrapS = THREE.RepeatWrapping;
            buildingTexture.wrapT = THREE.RepeatWrapping;
            const buildingMat = new THREE.MeshStandardMaterial({
                map: buildingTexture,
                emissiveMap: buildingTexture,
                emissive: 0x8899bb,
                emissiveIntensity: 0.45,
                roughness: 0.85
            });

            let seed = 1337;
            const seededRandom = () => {
                seed = (seed * 1664525 + 1013904223) % 4294967296;
                return seed / 4294967296;
            };
            const sampledRoad = roadSegments.filter((_, idx) => idx % 20 === 0).map(seg => seg.start);
            for (let i = 0; i < 95; i++) {
                const segPoint = sampledRoad[Math.floor(seededRandom() * sampledRoad.length)];
                const angle = seededRandom() * Math.PI * 2;
                const radial = 36 + seededRandom() * 145;
                const bx = segPoint.x + Math.cos(angle) * radial;
                const bz = segPoint.z + Math.sin(angle) * radial;

                let minRoadDistSq = Infinity;
                for (let j = 0; j < sampledRoad.length; j++) {
                    const dx = bx - sampledRoad[j].x;
                    const dz = bz - sampledRoad[j].z;
                    const dSq = dx * dx + dz * dz;
                    if (dSq < minRoadDistSq) minRoadDistSq = dSq;
                }
                if (minRoadDistSq < 28 * 28) continue;

                const width = 14 + seededRandom() * 22;
                const depth = 14 + seededRandom() * 22;
                const height = 28 + seededRandom() * 105;
                const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMat);
                building.position.set(bx, height / 2 - 2, bz);
                scene.add(building);
            }

            if (trafficSpawnTimer) {
                clearInterval(trafficSpawnTimer);
                trafficSpawnTimer = null;
            }
            return roadTexturesReady;
        }

        function placeOnTrack(car, progress, lane) {
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
                car.position.set(px - tz * lane, py, pz + tx * lane);
                car.rotation.y = Math.atan2(-tx, -tz);
                return;
            }
            const point = trackCurve.getPointAt(t);
            const tangent = trackCurve.getTangentAt(t);
            car.position.set(
                point.x - tangent.z * lane,
                point.y,
                point.z + tangent.x * lane
            );
            car.rotation.y = Math.atan2(-tangent.x, -tangent.z);
        }

        function evaluateRoadSegment(segment, x, y, z) {
            const a = segment.start;
            const b = segment.end;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            const lengthSquared = dx * dx + dy * dy + dz * dz || 1;
            const projection = THREE.MathUtils.clamp(
                ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / lengthSquared,
                0,
                1
            );
            const roadX = a.x + dx * projection;
            const roadY = a.y + dy * projection;
            const roadZ = a.z + dz * projection;
            const offsetX = x - roadX;
            const offsetY = y - roadY;
            const offsetZ = z - roadZ;
            const horizontalSegLength = Math.hypot(dx, dz) || 1;
            const segLength3D = Math.hypot(dx, dy, dz) || 1;
            return {
                x: roadX,
                y: roadY,
                z: roadZ,
                tangentX: dx / horizontalSegLength,
                tangentZ: dz / horizontalSegLength,
                slopeSin: dy / segLength3D,
                horizontalDistance: Math.hypot(offsetX, offsetZ),
                verticalDistance: Math.abs(offsetY),
                progress: (segment.index + projection) / trackResolution,
                segmentIndex: segment.index,
                distanceSquared: offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ
            };
        }

        function findNearestRoadPoint(x, y, z, hintIndex = -1) {
            const totalSegments = roadSegments.length;
            if (!totalSegments) return null;

            let nearest = null;
            let nearestDistanceSquared = Infinity;

            if (hintIndex >= 0 && hintIndex < totalSegments) {
                const searchRadius = 45;
                for (let offset = -searchRadius; offset <= searchRadius; offset++) {
                    const idx = (hintIndex + offset + totalSegments) % totalSegments;
                    const candidate = evaluateRoadSegment(roadSegments[idx], x, y, z);
                    if (candidate.distanceSquared < nearestDistanceSquared) {
                        nearestDistanceSquared = candidate.distanceSquared;
                        nearest = candidate;
                    }
                }
                if (nearest && nearest.horizontalDistance <= 18 && nearest.verticalDistance <= 4) {
                    return nearest;
                }
            }

            for (let i = 0; i < totalSegments; i++) {
                const candidate = evaluateRoadSegment(roadSegments[i], x, y, z);
                if (candidate.distanceSquared < nearestDistanceSquared) {
                    nearestDistanceSquared = candidate.distanceSquared;
                    nearest = candidate;
                }
            }

            return nearest;
        }

