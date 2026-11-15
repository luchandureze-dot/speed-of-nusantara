(function () {
    const models = {
        car: {
            name: 'Toyota Innova Zenix',
            path: '../assets/toyota-innova-zenix-2023/model.dae',
            output: '../assets/toyota-innova-zenix-2023/wheel-annotations.json',
            roles: [
                { id: 'front-left', label: 'Depan kiri', color: 0x3aa6ff, x: -0.7757, y: 0.3402, z: -1.4477 },
                { id: 'front-right', label: 'Depan kanan', color: 0x45d483, x: 0.7757, y: 0.3402, z: -1.4477 },
                { id: 'rear-left', label: 'Belakang kiri', color: 0xffc247, x: -0.7757, y: 0.3402, z: 1.4041 },
                { id: 'rear-right', label: 'Belakang kanan', color: 0xff6b6b, x: 0.7757, y: 0.3402, z: 1.4041 }
            ]
        },
        motorcycle: {
            name: 'Yamaha NMAX Neo',
            path: '../assets/yamaha-nmax-neo-155/model.dae',
            output: '../assets/yamaha-nmax-neo-155/wheel-annotations.json',
            roles: [
                { id: 'front', label: 'Depan', color: 0x3aa6ff, x: 0, y: 0.2379, z: -0.73 },
                { id: 'rear', label: 'Belakang', color: 0xffc247, x: 0, y: 0.2379, z: 0.6234 }
            ]
        }
    };

    const modelSelect = document.getElementById('model-select');
    const loadButton = document.getElementById('load-button');
    const tree = document.getElementById('tree');
    const roleSummary = document.getElementById('role-summary');
    const assignmentSelect = document.getElementById('assignment');
    const assignButton = document.getElementById('assign-button');
    const isolateButton = document.getElementById('isolate-button');
    const previewButton = document.getElementById('preview-button');
    const exportButton = document.getElementById('export-button');
    const areaSelectButton = document.getElementById('area-select-button');
    const selectionName = document.getElementById('selection-name');
    const status = document.getElementById('status');
    const viewport = document.getElementById('viewport');
    const viewportHelp = document.getElementById('viewport-help');
    const selectionRect = document.getElementById('selection-rect');
    const assignedRoles = new Map();
    const objectByPath = new Map();
    const pathByObject = new WeakMap();
    const meshesByObject = new WeakMap();
    const originalVisibilityByObject = new WeakMap();
    const treeElementByPath = new Map();
    const expandedPaths = new Set();
    const previewObjectByPath = new Map();
    const previewPathByObject = new WeakMap();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const loader = new THREE.ColladaLoader();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x25292c);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    camera.position.set(6, 4, 7);
    const renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputEncoding = THREE.sRGBEncoding;
    viewport.insertBefore(renderer.domElement, viewport.firstChild);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.8, 0);
    controls.addEventListener('change', handleControlsChange);
    scene.add(new THREE.HemisphereLight(0xe5f2ff, 0x43403b, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);
    const ground = new THREE.GridHelper(12, 24, 0x687078, 0x42484d);
    ground.position.y = -0.02;
    scene.add(ground);

    let activeModelType = null;
    let modelRoot = null;
    let vehicleRoot = null;
    let selectedObject = null;
    let selectedMeshes = [];
    let selectedMeshSet = new Set();
    let selectedHelper = null;
    let isolationMode = false;
    let isolationMeshes = [];
    let isolationMeshSet = new Set();
    let areaSelectionEnabled = false;
    let areaSelectionStart = null;
    let spinning = false;
    let spinTime = 0;
    let renderFrame = null;
    let controlsChanged = false;
    const clock = new THREE.Clock();

    function setStatus(message, isError) {
        status.textContent = message;
        status.dataset.error = isError ? 'true' : 'false';
    }

    function objectPath(object, root) {
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

    function cacheMeshes(object) {
        const meshes = [];
        if (object.isMesh && object.geometry) meshes.push(object);
        object.children.forEach(child => {
            const childMeshes = cacheMeshes(child);
            childMeshes.forEach(mesh => meshes.push(mesh));
        });
        meshesByObject.set(object, meshes);
        return meshes;
    }

    function getMeshes(object) {
        return meshesByObject.get(object) || cacheMeshes(object);
    }

    function renderScene() {
        renderer.render(scene, camera);
    }

    function requestRender() {
        if (renderFrame === null) {
            renderFrame = requestAnimationFrame(renderFrameLoop);
        }
    }

    function handleControlsChange() {
        controlsChanged = true;
        requestRender();
    }

    function renderFrameLoop() {
        renderFrame = null;
        controlsChanged = false;
        if (spinning && modelRoot) {
            spinTime += Math.min(0.05, clock.getDelta()) * 2.2;
            modelRoot.children.forEach(child => {
                if (child.userData.annotatorPreviewGroup) {
                    child.rotation.x = spinTime;
                }
            });
        }
        controls.update();
        renderScene();
        if (spinning || controlsChanged) requestRender();
    }

    function assignedRole(path) {
        for (const [roleId, paths] of assignedRoles) {
            if (paths.has(path)) return roleId;
        }
        return null;
    }

    function roleFor(roleId) {
        return models[activeModelType].roles.find(role => role.id === roleId);
    }

    function selectObject(object, preserveIsolation = false) {
        if (areaSelectionEnabled) setAreaSelectionMode(false);
        const keepIsolation = preserveIsolation && isolationMode;
        selectedObject = object;
        selectedMeshes = getMeshes(object);
        selectedMeshSet = new Set(selectedMeshes);
        const label = object.name || object.type || 'Objek tanpa nama';
        const path = objectPath(object, vehicleRoot);
        selectionName.textContent = `${label} · ${selectedMeshes.length} mesh · jalur ${path}`;
        assignButton.disabled = !selectedMeshes.length;
        isolateButton.disabled = !selectedMeshes.length;
        if (!keepIsolation) {
            isolationMode = selectedMeshes.length > 0;
            isolationMeshes = [...selectedMeshes];
            isolationMeshSet = new Set(isolationMeshes);
        }
        isolateButton.textContent = isolationMode
            ? 'Tampilkan seluruh mobil'
            : 'Isolasi pilihan';
        const roleIds = new Set(selectedMeshes.map(mesh => assignedRole(pathByObject.get(mesh))).filter(Boolean));
        assignmentSelect.value = roleIds.size === 1 ? [...roleIds][0] : '';
        if (isolationMode) {
            applyIsolationVisibility();
            if (!keepIsolation) frameObject(object);
        }
        updateTreeSelection();
        updateSelectionHelper();
        requestRender();
    }

    function selectMeshes(meshes) {
        selectedObject = null;
        selectedMeshes = [...new Set(meshes)].filter(mesh => pathByObject.has(mesh));
        selectedMeshSet = new Set(selectedMeshes);
        applyIsolationVisibility();
        selectionName.textContent = `${selectedMeshes.length} mesh dipilih dari area.`;
        assignButton.disabled = !selectedMeshes.length;
        isolateButton.disabled = !selectedMeshes.length && !isolationMode;
        isolateButton.textContent = isolationMode
            ? 'Tampilkan seluruh mobil'
            : 'Isolasi pilihan';
        setStatus(`${selectedMeshes.length} mesh dipilih.`);
        const roleIds = new Set(selectedMeshes.map(mesh => assignedRole(pathByObject.get(mesh))).filter(Boolean));
        assignmentSelect.value = roleIds.size === 1 ? [...roleIds][0] : '';
        updateTreeSelection();
        updateSelectionHelper();
        requestRender();
    }

    function updateTreeSelection() {
        const selectedPath = selectedObject ? objectPath(selectedObject, vehicleRoot) : null;
        const selectedPaths = new Set(selectedMeshes.map(mesh => pathByObject.get(mesh)));
        treeElementByPath.forEach((element, path) => {
            element.classList.toggle('selected', path === selectedPath || selectedPaths.has(path));
        });
    }

    function frameObject(object) {
        frameBounds(new THREE.Box3().setFromObject(object));
    }

    function frameBounds(bounds) {
        if (bounds.isEmpty()) return;
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 0.05);
        const direction = camera.position.clone().sub(controls.target).normalize();
        const distance = radius * 2.4;
        controls.target.copy(center);
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.near = Math.max(0.001, distance / 1000);
        camera.far = Math.max(100, distance * 100);
        camera.updateProjectionMatrix();
        controls.update();
    }

    function applyIsolationVisibility() {
        if (!vehicleRoot) return;
        const visibleObjects = new Set();
        if (isolationMode && isolationMeshes.length) {
            isolationMeshes.forEach(mesh => {
                let current = mesh;
                while (current) {
                    visibleObjects.add(current);
                    if (current === vehicleRoot) break;
                    current = current.parent;
                }
            });
        }

        vehicleRoot.traverse(object => {
            const path = pathByObject.get(object);
            const isAssignedSource = path !== undefined && previewObjectByPath.has(path);
            const wasVisible = originalVisibilityByObject.get(object) !== false;
            object.visible = wasVisible &&
                (!isolationMode || visibleObjects.has(object)) &&
                !isAssignedSource;
        });
        previewObjectByPath.forEach((clone, path) => {
            clone.visible = !isolationMode || visibleObjects.has(objectByPath.get(path));
        });
    }

    function setIsolationMode(enabled) {
        if (enabled && areaSelectionEnabled) setAreaSelectionMode(false);
        isolationMode = enabled && selectedMeshes.length > 0;
        isolationMeshes = isolationMode ? [...selectedMeshes] : [];
        isolationMeshSet = new Set(isolationMeshes);
        isolateButton.disabled = !selectedMeshes.length;
        isolateButton.textContent = isolationMode
            ? 'Tampilkan seluruh mobil'
            : 'Isolasi pilihan';
        applyIsolationVisibility();
        if (isolationMode) {
            frameBounds(selectedBounds());
        } else if (modelRoot) {
            frameObject(modelRoot);
        }
        updateSelectionHelper();
        requestRender();
    }

    function selectedBounds() {
        const bounds = new THREE.Box3();
        const meshBounds = new THREE.Box3();
        selectedMeshes.forEach(mesh => {
            const path = pathByObject.get(mesh);
            meshBounds.setFromObject(previewObjectByPath.get(path) || mesh);
            bounds.union(meshBounds);
        });
        return bounds;
    }

    function setAreaSelectionMode(enabled) {
        areaSelectionEnabled = enabled;
        areaSelectButton.setAttribute('aria-pressed', String(enabled));
        areaSelectButton.textContent = enabled ? 'Selesai pilih area' : 'Pilih area';
        controls.enabled = true;
        controls.enableRotate = !enabled;
        controls.enablePan = !enabled;
        controls.enableZoom = true;
        renderer.domElement.style.cursor = enabled ? 'crosshair' : '';
        viewportHelp.textContent = enabled
            ? 'Drag untuk memilih beberapa mesh · Klik untuk memilih satu · Klik Selesai pilih area untuk keluar'
            : 'Drag: orbit · Scroll: zoom · Klik objek: pilih';
        selectionRect.hidden = true;
        areaSelectionStart = null;
        if (enabled && modelRoot && !isolationMode) frameObject(modelRoot);
        requestRender();
    }

    function pointerPosition(event) {
        const bounds = renderer.domElement.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
            y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
        };
    }

    function drawSelectionRect(start, end) {
        selectionRect.style.left = `${Math.min(start.x, end.x)}px`;
        selectionRect.style.top = `${Math.min(start.y, end.y)}px`;
        selectionRect.style.width = `${Math.abs(start.x - end.x)}px`;
        selectionRect.style.height = `${Math.abs(start.y - end.y)}px`;
    }

    function isEffectivelyVisible(object) {
        let current = object;
        while (current) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }

    function isInIsolationScope(object) {
        if (!isolationMode) return true;
        const path = previewPathByObject.get(object);
        const source = path !== undefined ? objectByPath.get(path) : object;
        return isolationMeshSet.has(source);
    }

    function meshesInSelectionRect(rectangle) {
        const matches = [];
        const normalizedRect = {
            left: Math.min(rectangle.left, rectangle.right),
            right: Math.max(rectangle.left, rectangle.right),
            top: Math.min(rectangle.top, rectangle.bottom),
            bottom: Math.max(rectangle.top, rectangle.bottom)
        };
        const width = renderer.domElement.clientWidth;
        const height = renderer.domElement.clientHeight;
        camera.updateMatrixWorld(true);
        if (modelRoot) modelRoot.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3();
        const corner = new THREE.Vector3();

        objectByPath.forEach((mesh, path) => {
            const target = previewObjectByPath.get(path) || mesh;
            if (!isEffectivelyVisible(target) || !isInIsolationScope(target)) return;
            bounds.setFromObject(target);
            if (bounds.isEmpty()) return;

            let left = Infinity;
            let right = -Infinity;
            let top = Infinity;
            let bottom = -Infinity;
            let hasVisibleCorner = false;
            for (let index = 0; index < 8; index += 1) {
                corner.set(
                    index & 1 ? bounds.max.x : bounds.min.x,
                    index & 2 ? bounds.max.y : bounds.min.y,
                    index & 4 ? bounds.max.z : bounds.min.z
                ).project(camera);
                if (corner.z < -1 || corner.z > 1) continue;
                const x = (corner.x + 1) * 0.5 * width;
                const y = (1 - corner.y) * 0.5 * height;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                hasVisibleCorner = true;
            }
            if (!hasVisibleCorner) return;
            if (right >= normalizedRect.left &&
                left <= normalizedRect.right &&
                bottom >= normalizedRect.top &&
                top <= normalizedRect.bottom) {
                matches.push(mesh);
            }
        });
        return matches;
    }

    function meshAtPointer(event) {
        if (!vehicleRoot) return null;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(modelRoot.children, true);
        const hit = hits.find(item =>
            (pathByObject.has(item.object) || previewPathByObject.has(item.object)) &&
            isEffectivelyVisible(item.object) &&
            isInIsolationScope(item.object)
        );
        if (!hit) return null;
        const path = previewPathByObject.get(hit.object);
        return path ? objectByPath.get(path) : hit.object;
    }

    function onAreaPointerDown(event) {
        if (!areaSelectionEnabled || event.button !== 0 || !vehicleRoot) return;
        event.preventDefault();
        areaSelectionStart = pointerPosition(event);
        drawSelectionRect(areaSelectionStart, areaSelectionStart);
        selectionRect.hidden = false;
    }

    function onAreaPointerMove(event) {
        if (!areaSelectionEnabled || !areaSelectionStart) return;
        drawSelectionRect(areaSelectionStart, pointerPosition(event));
    }

    function onAreaPointerUp(event) {
        if (!areaSelectionEnabled || !areaSelectionStart) return;
        const start = areaSelectionStart;
        const end = pointerPosition(event);
        areaSelectionStart = null;
        selectionRect.hidden = true;

        if (Math.abs(start.x - end.x) < 4 && Math.abs(start.y - end.y) < 4) {
            const mesh = meshAtPointer(event);
            selectMeshes(mesh ? [mesh] : []);
            return;
        }
        selectMeshes(meshesInSelectionRect({
            left: start.x,
            top: start.y,
            right: end.x,
            bottom: end.y
        }));
        if (!selectedMeshes.length) setStatus('Tidak ada mesh di area yang dipilih.');
    }

    function onAreaPointerCancel(event) {
        if (!areaSelectionStart) return;
        areaSelectionStart = null;
        selectionRect.hidden = true;
    }

    function updateSelectionHelper() {
        if (selectedHelper) {
            scene.remove(selectedHelper);
            selectedHelper.traverse(object => {
                if (!object.isLineSegments) return;
                object.geometry.dispose();
                object.material.dispose();
            });
            selectedHelper = null;
        }
        if (!selectedMeshes.length || !modelRoot) return;
        const bounds = selectedBounds();
        if (bounds.isEmpty()) return;
        selectedHelper = new THREE.Box3Helper(bounds, 0x25d9ff);
        selectedHelper.visible = !spinning;
        scene.add(selectedHelper);
    }

    function renderNode(object) {
        const meshes = getMeshes(object);
        if (!meshes.length) return null;
        const item = document.createElement('li');
        const path = objectPath(object, vehicleRoot);
        const element = object.children.length
            ? document.createElement('summary')
            : document.createElement('button');
        const roles = new Set(meshes.map(mesh => assignedRole(pathByObject.get(mesh))).filter(Boolean));
        const typeLabel = object.isMesh ? 'mesh' : object.type || 'node';
        element.textContent = `${object.name || '(tanpa nama)'} · ${typeLabel}${roles.size ? ` · ${[...roles].map(id => roleFor(id).label).join(', ')}` : ''}`;
        element.title = `${element.textContent} [${path}]`;
        element.dataset.path = path;
        element.classList.toggle('selected', object === selectedObject || selectedMeshSet.has(object));
        element.classList.toggle('assigned', roles.size > 0);
        element.addEventListener('click', () => {
            selectObject(object);
        });
        treeElementByPath.set(path, element);
        if (object.children.length) {
            const details = document.createElement('details');
            details.open = expandedPaths.has(path);
            const children = document.createElement('ul');
            const populateChildren = () => {
                if (details.dataset.rendered) return;
                object.children.forEach(child => {
                    const childNode = renderNode(child);
                    if (childNode) children.appendChild(childNode);
                });
                details.dataset.rendered = 'true';
            };
            details.addEventListener('toggle', () => {
                if (details.open) {
                    expandedPaths.add(path);
                    populateChildren();
                } else {
                    expandedPaths.delete(path);
                }
            });
            details.append(element, children);
            item.appendChild(details);
            if (details.open) populateChildren();
        } else {
            item.appendChild(element);
        }
        return item;
    }

    function renderTree() {
        tree.replaceChildren();
        treeElementByPath.clear();
        if (vehicleRoot) {
            vehicleRoot.children.forEach(child => {
                const childNode = renderNode(child);
                if (childNode) tree.appendChild(childNode);
            });
        }
    }

    function renderRoleSummary() {
        const definition = models[activeModelType];
        roleSummary.replaceChildren();
        let allRolesAssigned = true;
        definition.roles.forEach(role => {
            const count = assignedRoles.get(role.id).size;
            if (!count) allRolesAssigned = false;
            const row = document.createElement('div');
            row.className = 'role-row';
            const name = document.createElement('strong');
            name.textContent = role.label;
            name.style.color = `#${role.color.toString(16).padStart(6, '0')}`;
            const countLabel = document.createElement('span');
            countLabel.textContent = `${count} mesh ditandai`;
            row.append(name, countLabel);
            roleSummary.appendChild(row);
        });
        exportButton.disabled = !allRolesAssigned;
        previewButton.disabled = !allRolesAssigned;
    }

    function restorePreviewObjects() {
        if (!vehicleRoot) return;
        vehicleRoot.traverse(object => {
            if (object.userData.annotatorOriginalVisible !== undefined) {
                object.visible = object.userData.annotatorOriginalVisible;
                delete object.userData.annotatorOriginalVisible;
            }
        });
        const previewGroups = [];
        modelRoot.traverse(object => {
            if (object.userData.annotatorPreviewGroup) previewGroups.push(object);
        });
        previewGroups.forEach(group => {
            group.traverse(object => {
                if (object.isMesh) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(material => material.dispose());
                }
            });
            if (group.parent) group.parent.remove(group);
        });
        requestRender();
    }

    function refreshPreviewObjects() {
        restorePreviewObjects();
        previewObjectByPath.clear();
        const definition = models[activeModelType];
        const pivots = new Map();
        definition.roles.forEach(role => {
            const pivot = new THREE.Group();
            pivot.userData.annotatorPreviewGroup = true;
            pivot.position.copy(modelRoot.worldToLocal(new THREE.Vector3(role.x, role.y, role.z)));
            modelRoot.add(pivot);
            pivots.set(role.id, pivot);
        });
        modelRoot.updateWorldMatrix(true, true);

        assignedRoles.forEach((paths, roleId) => {
            const role = roleFor(roleId);
            const pivot = pivots.get(roleId);
            paths.forEach(path => {
                const mesh = objectByPath.get(path);
                if (!mesh || !mesh.parent) return;
                const clone = mesh.clone();
                mesh.parent.add(clone);
                clone.updateWorldMatrix(true, false);
                pivot.attach(clone);
                previewObjectByPath.set(path, clone);
                previewPathByObject.set(clone, path);
                const tint = new THREE.Color(role.color);
                const originals = Array.isArray(clone.material) ? clone.material : [clone.material];
                const tinted = originals.map(material => {
                    const copy = material.clone();
                    if (copy.emissive) {
                        copy.emissive.lerp(tint, 0.28);
                        copy.emissiveIntensity = 0.6;
                    }
                    return copy;
                });
                clone.material = Array.isArray(clone.material) ? tinted : tinted[0];
                if (mesh.userData.annotatorOriginalVisible === undefined) {
                    mesh.userData.annotatorOriginalVisible = mesh.visible;
                }
                mesh.visible = false;
            });
        });
        applyIsolationVisibility();
        updateSelectionHelper();
        requestRender();
    }

    function roleOptions() {
        assignmentSelect.replaceChildren();
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'Tidak berputar';
        assignmentSelect.appendChild(none);
        models[activeModelType].roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.label;
            assignmentSelect.appendChild(option);
        });
    }

    function applyAssignment() {
        if (!selectedMeshes.length) return;
        const meshes = selectedMeshes;
        const roleId = assignmentSelect.value;
        meshes.forEach(mesh => {
            const path = pathByObject.get(mesh);
            assignedRoles.forEach(paths => paths.delete(path));
            if (roleId) assignedRoles.get(roleId).add(path);
        });
        refreshPreviewObjects();
        renderTree();
        renderRoleSummary();
        setStatus(`${meshes.length} mesh diperbarui.`);
    }

    function configuration() {
        return {
            version: 1,
            vehicleType: activeModelType,
            wheels: models[activeModelType].roles.map(role => ({
                id: role.id,
                objects: [...assignedRoles.get(role.id)].sort()
            }))
        };
    }

    function importConfiguration(data) {
        const roles = models[activeModelType].roles;
        if (!data || data.version !== 1 || data.vehicleType !== activeModelType ||
            !Array.isArray(data.wheels)) {
            throw new Error('Format konfigurasi tidak sesuai dengan aset ini.');
        }
        const next = new Map(roles.map(role => [role.id, new Set()]));
        const configuredWheelIds = new Set();
        data.wheels.forEach(wheel => {
            if (
                !next.has(wheel.id) ||
                configuredWheelIds.has(wheel.id) ||
                !Array.isArray(wheel.objects)
            ) {
                throw new Error('Konfigurasi berisi peran roda atau daftar objek yang tidak valid.');
            }
            configuredWheelIds.add(wheel.id);
            wheel.objects.forEach(path => {
                if (!objectByPath.has(path)) {
                    throw new Error(`Objek konfigurasi tidak ditemukan pada model: ${path}`);
                }
                next.get(wheel.id).add(path);
            });
        });
        if (roles.some(role => !next.get(role.id).size)) {
            throw new Error('Setiap roda harus memiliki setidaknya satu mesh.');
        }
        assignedRoles.clear();
        next.forEach((paths, roleId) => assignedRoles.set(roleId, paths));
        refreshPreviewObjects();
        renderTree();
        renderRoleSummary();
    }

    async function loadModel() {
        const type = modelSelect.value;
        activeModelType = type;
        spinning = false;
        isolationMode = false;
        isolationMeshes = [];
        isolationMeshSet.clear();
        clock.getDelta();
        previewButton.textContent = 'Pratinjau putaran roda';
        assignedRoles.clear();
        models[type].roles.forEach(role => assignedRoles.set(role.id, new Set()));
        roleOptions();
        roleSummary.replaceChildren();
        tree.replaceChildren();
        selectedObject = null;
        selectedMeshes = [];
        selectedMeshSet.clear();
        updateSelectionHelper();
        selectionName.textContent = 'Belum ada objek dipilih.';
        assignButton.disabled = true;
        isolateButton.disabled = true;
        isolateButton.textContent = 'Isolasi pilihan';
        exportButton.disabled = true;
        previewButton.disabled = true;
        expandedPaths.clear();
        areaSelectionEnabled = false;
        areaSelectionStart = null;
        controls.enabled = true;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        renderer.domElement.style.cursor = '';
        areaSelectButton.setAttribute('aria-pressed', 'false');
        areaSelectButton.textContent = 'Pilih area';
        viewportHelp.textContent = 'Drag: orbit · Scroll: zoom · Klik objek: pilih';
        selectionRect.hidden = true;
        if (modelRoot) {
            restorePreviewObjects();
            scene.remove(modelRoot);
        }
        modelRoot = null;
        vehicleRoot = null;
        objectByPath.clear();
        previewObjectByPath.clear();
        setStatus(`Memuat ${models[type].name}...`);

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

        try {
            const chunkedText = await loadChunkedColladaText(models[type].path);
            const collada = chunkedText
                ? loader.parse(chunkedText, THREE.LoaderUtils.extractUrlBase(models[type].path))
                : await new Promise((resolve, reject) => {
                    loader.load(models[type].path, resolve, undefined, reject);
                });
            const sketchUpScene = collada.scene.children.find(child => child.name === 'SketchUp');
            const foundVehicle = sketchUpScene &&
                sketchUpScene.children.find(child => child.name === 'group_0');
            if (!foundVehicle) throw new Error('Grup kendaraan "group_0" tidak ditemukan di file DAE.');

            modelRoot = new THREE.Group();
            modelRoot.rotation.copy(collada.scene.rotation);
            modelRoot.scale.copy(collada.scene.scale);
            const facing = new THREE.Group();
            facing.rotation.z = type === 'motorcycle' ? Math.PI * 1.5 : Math.PI;
            facing.add(foundVehicle);
            modelRoot.add(facing);
            vehicleRoot = foundVehicle;
            modelRoot.updateWorldMatrix(true, true);
            let bounds = new THREE.Box3().setFromObject(modelRoot);
            let size = bounds.getSize(new THREE.Vector3());
            if (!size.toArray().every(value => Number.isFinite(value) && value > 0)) {
                throw new Error('Ukuran model tidak valid.');
            }
            if (type === 'motorcycle') {
                modelRoot.scale.multiplyScalar(1.935 / Math.max(size.x, size.z));
                modelRoot.updateWorldMatrix(true, true);
                bounds = new THREE.Box3().setFromObject(modelRoot);
            }
            const center = bounds.getCenter(new THREE.Vector3());
            modelRoot.position.set(-center.x, -bounds.min.y, -center.z);
            modelRoot.updateWorldMatrix(true, true);
            scene.add(modelRoot);
            modelRoot.traverse(object => {
                originalVisibilityByObject.set(object, object.visible);
                if (object.isMesh) {
                    const path = objectPath(object, vehicleRoot);
                    if (path !== null) {
                        objectByPath.set(path, object);
                        pathByObject.set(object, path);
                    }
                }
            });
            cacheMeshes(vehicleRoot);
            const modelSize = new THREE.Box3().setFromObject(modelRoot).getSize(new THREE.Vector3());
            camera.position.set(modelSize.x * 1.35, modelSize.y * 1.15, modelSize.z * 1.6);
            controls.target.set(0, modelSize.y * 0.48, 0);
            controls.update();
            renderTree();
            renderRoleSummary();

            if (window.location.protocol === 'file:') {
                setStatus(`${models[type].name} siap. Belum ada konfigurasi roda; pilih mesh yang benar.`);
            } else {
                const response = await fetch(models[type].output);
                if (response.status === 404) {
                    setStatus(`${models[type].name} siap. Belum ada konfigurasi roda; pilih mesh yang benar.`);
                } else if (!response.ok) {
                    throw new Error(`Gagal membaca konfigurasi roda (HTTP ${response.status}).`);
                } else {
                    importConfiguration(await response.json());
                    setStatus(`${models[type].name} siap. Konfigurasi roda yang tersimpan dimuat.`);
                }
            }
            requestRender();
        } catch (error) {
            setStatus(`Gagal memuat model: ${error.message || error}`, true);
            console.error('Gagal memuat model untuk anotasi roda:', error);
        }
    }

    function exportConfiguration() {
        const data = configuration();
        const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
            type: 'application/json'
        });
        const link = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = 'wheel-annotations.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        setStatus(`Konfigurasi diunduh. Simpan di ${models[activeModelType].output.replace('../', '')}.`);
    }

    function onCanvasClick(event) {
        if (areaSelectionEnabled) return;
        const mesh = meshAtPointer(event);
        if (mesh) selectObject(mesh, isolationMode);
    }

    function resize() {
        const width = Math.max(1, viewport.clientWidth);
        const height = Math.max(1, viewport.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        requestRender();
    }

    models[modelSelect.value].roles.forEach(role => assignedRoles.set(role.id, new Set()));
    loadButton.addEventListener('click', loadModel);
    modelSelect.addEventListener('change', loadModel);
    assignButton.addEventListener('click', applyAssignment);
    areaSelectButton.addEventListener('click', () => setAreaSelectionMode(!areaSelectionEnabled));
    isolateButton.addEventListener('click', () => setIsolationMode(!isolationMode));
    exportButton.addEventListener('click', exportConfiguration);
    document.getElementById('config-file').addEventListener('change', async event => {
        const [file] = event.target.files;
        if (!file) return;
        try {
            importConfiguration(JSON.parse(await file.text()));
            setStatus('Konfigurasi roda berhasil dimuat.');
        } catch (error) {
            setStatus(`Gagal memuat konfigurasi roda: ${error.message || error}`, true);
        }
        event.target.value = '';
    });
    previewButton.addEventListener('click', () => {
        spinning = !spinning;
        previewButton.textContent = spinning ? 'Hentikan pratinjau' : 'Pratinjau putaran roda';
        if (spinning) {
            spinTime = 0;
            if (selectedHelper) selectedHelper.visible = false;
            clock.getDelta();
            requestRender();
        } else {
            if (selectedHelper) {
                selectedHelper.visible = true;
                selectedHelper.box.copy(selectedBounds());
                selectedHelper.updateMatrixWorld(true);
            }
            requestRender();
        }
    });
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('pointerdown', onAreaPointerDown);
    window.addEventListener('pointermove', onAreaPointerMove);
    window.addEventListener('pointerup', onAreaPointerUp);
    window.addEventListener('pointercancel', onAreaPointerCancel);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewport);
    resize();
    loadModel();
})();
