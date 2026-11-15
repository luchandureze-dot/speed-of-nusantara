        let scene, camera, renderer;
        let playerCar;
        let trafficCars = [];
        let trackCurve;
        let trackLength = 1;
        const trackResolution = 4000;
        let roadSegments = [];
        let playerX = 0;
        let playerY = 0;
        let playerZ = 0;
        let playerYaw = 0;
        let yawRate = 0;
        let bodyRoll = 0;
        let bodyRollVelocity = 0;
        let bodyPitch = 0;
        let bodyPitchVelocity = 0;
        let motorcyclePitch = 0;
        let motorcyclePitchVelocity = 0;
        let motorcycleFrontWheelLifted = false;
        let motorcycleRearWheelLifted = false;
        let velocityX = 0;
        let velocityZ = 0;
        let longitudinalAcceleration = 0;
        let lateralAcceleration = 0;
        let tireLayout = [];
        let wheelAngularSpeeds = [];
        let playerWheelPivots = [];
        let verticalVelocity = 0;
        let playerTrackProgress = 0.08;
        let totalDistance = 0;
        let clock;
        
        // Status Kontrol
        const keys = { forward: false, backward: false, left: false, right: false };
        
        // Konfigurasi fisika kendaraan
        let carSpeed = 0;
        let engineRpm = 1000;
        let currentGear = 1;
        let wheelbase = 2.7;
        const vehiclePhysicsConfigs = {
            car: {
                mass: 1595,
                cgHeight: 0.645,
                weightDistributionFront: 0.58,
                idleRpm: 1000,
                maxRpm: 6600,
                maxTorqueNm: 205,
                gearRatios: [3.377, 2.2, 1.5, 1.0, 0.7],
                finalDrive: 4.262,
                wheelRadius: 0.3264,
                dragCoefficient: 0.33,
                frontalArea: 2.82,
                rollingResistanceCoefficient: 0.015,
                maxBrakingForce: 12000,
                brakeBiasFront: 0.685,
                frictionCoefficient: 0.92,
                longitudinalStiffness: 5,
                lateralStiffness: 4.5,
                tireShapeFactor: 1.3,
                wheelInertia: 2.5,
                drivenAxle: 'front',
                maxInnerWheelSteerAngle: 0.34,
                maxOuterWheelSteerAngle: 0.34 * (31.2 / 37.5),
                steeringSpeedFalloff: 0.65,
                frontSpringRate: 28500,
                rearSpringRate: 34000,
                frontDampingRatio: 0.28,
                rearDampingRatio: 0.30,
                frontRollCenterHeight: 0.095,
                rearRollCenterHeight: 0.235,
                maxBodyRoll: 0.2,
                maxSpeed: 55.6,
                reverseSpeed: 8
            },
            motorcycle: {
                mass: 200,
                cgHeight: 0.585,
                weightDistributionFront: 0.45,
                idleRpm: 1000,
                maxRpm: 8500,
                maxTorqueNm: 14.2,
                gearRatios: [2.5, 1.8, 1.2],
                finalDrive: 3.5,
                wheelRadius: 0.2485,
                dragCoefficient: 0.62,
                frontalArea: 0.68,
                rollingResistanceCoefficient: 0.015,
                maxBrakingForce: 1800,
                brakeBiasFront: 0.72,
                frictionCoefficient: 0.96,
                longitudinalStiffness: 5,
                lateralStiffness: 4.5,
                tireShapeFactor: 1.3,
                wheelInertia: 0.25,
                drivenAxle: 'rear',
                maxSteeringAngle: 42 * Math.PI / 180,
                steeringSpeedFalloff: 0.28,
                frontSpringRate: 7800,
                rearSpringRate: 26000,
                frontDampingRatio: 0.32,
                rearDampingRatio: 0.35,
                camberThrustCoefficient: 1.15,
                leanSpring: 36,
                leanDamper: 12,
                maxBodyRoll: 43.5 * Math.PI / 180,
                maxPitch: 0.18,
                maxSpeed: 33.3,
                reverseSpeed: 2.2
            }
        };
        const airDensity = 1.225;
        const gravity = 9.81;
        const innovaZenixSpecs = {
            length: 4.755,
            width: 1.85,
            height: 1.795,
            wheelbase: 2.85,
            frontTread: 1.56,
            rearTread: 1.58,
            tireWidth: 0.205,
            tireRadius: 0.33645,
            dynamicTireRadius: 0.3264
        };
        const nmaxNeoSpecs = {
            length: 1.935,
            width: 0.74,
            height: 1.16,
            wheelbase: 1.34,
            frontTireWidth: 0.11,
            rearTireWidth: 0.13,
            frontTireRadius: 0.235,
            rearTireRadius: 0.2485
        };
        
        let score = 0;
        let isGameOver = false;
        let cameraMode = 1; // 1: Belakang, 2: Kap Mesin
        const cameraOrbits = {
            1: { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0, distance: Math.hypot(9, 3) },
            2: { yaw: 0, pitch: 0, yawVelocity: 0, pitchVelocity: 0, distance: Math.hypot(1.35, 0.75) }
        };
        let isCameraDragging = false;
        let lastCameraPointerX = 0;
        let lastCameraPointerY = 0;
        let hasStarted = false;
        let isLoadingVehicle = false;
        let isVehicleSelectionOpen = false;
        let previewScene;
        let previewCamera;
        let previewVehicleModels = {};
        let previewVehiclePivots = {};
        let startupAssetsReady = false;
        let previewPointerDown = false;
        let previewPointerX = 0;
        let previewRotation = 0;
        let playerName = 'NUSANTARA';
        let selectedVehicleType = 'car';
        let selectedVehicleColor = '#cc0000';
        let lastPlayerSegmentIndex = -1;
        let bonusScore = 0;
        let bestScore = Number(localStorage.getItem('speed_of_nusantara_best_score') || 0);
        let cameraShakeIntensity = 0;
        let nearMissBannerTimer = 0;
        let isAudioMuted = false;
        let trafficSpawnTimer = null;
