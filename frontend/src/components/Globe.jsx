import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Procedural Canvas Texture Generator for complete offline/CORS resilience
function createProceduralEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fill space black-blue background
  ctx.fillStyle = '#060913';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Generate glowing grid line matrix (cyberpunk aesthetic)
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;

  // Latitudes
  for (let lat = 0; lat < canvas.height; lat += 32) {
    ctx.beginPath();
    ctx.moveTo(0, lat);
    ctx.lineTo(canvas.width, lat);
    ctx.stroke();
  }

  // Longitudes
  for (let lon = 0; lon < canvas.width; lon += 32) {
    ctx.beginPath();
    ctx.moveTo(lon, 0);
    ctx.lineTo(lon, canvas.height);
    ctx.stroke();
  }

  // Draw stylized vector-like glowing world continents
  ctx.fillStyle = '#1e3a8a';
  ctx.globalAlpha = 0.7;
  
  // High quality rough approximations of continents for tech look
  // North America
  ctx.beginPath();
  ctx.moveTo(100, 100); ctx.lineTo(300, 100); ctx.lineTo(250, 250); ctx.lineTo(150, 200); ctx.closePath(); ctx.fill();
  
  // South America
  ctx.beginPath();
  ctx.moveTo(250, 250); ctx.lineTo(320, 280); ctx.lineTo(280, 450); ctx.lineTo(230, 350); ctx.closePath(); ctx.fill();

  // Eurasia & Africa
  ctx.beginPath();
  ctx.moveTo(450, 100); ctx.lineTo(800, 80); ctx.lineTo(750, 300); ctx.lineTo(600, 250); ctx.lineTo(550, 420); ctx.lineTo(480, 300); ctx.closePath(); ctx.fill();

  // Australia
  ctx.beginPath();
  ctx.moveTo(800, 350); ctx.lineTo(900, 380); ctx.lineTo(870, 460); ctx.lineTo(780, 420); ctx.closePath(); ctx.fill();

  // Earth neon outlines
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

export default function Globe({ debris, selectedObjects, onSelectObject }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showBands, setShowBands] = useState(true);
  const [timeMultiplier, setTimeMultiplier] = useState(1);
  const simTimeRef = useRef(Date.now());
  const timeMultiplierRef = useRef(1);

  useEffect(() => {
    timeMultiplierRef.current = timeMultiplier;
  }, [timeMultiplier]);
  
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const earthRef = useRef(null);
  const starFieldRef = useRef(null);
  const debrisPointsRef = useRef(null);
  const orbitLineRef = useRef(null);
  const pointsNoradIdsRef = useRef([]);
  const debrisRef = useRef(debris);
  const bandsGroupRef = useRef(null);
  const spriteMaterialsRef = useRef({});

  const getSpriteMaterial = (type, riskScore) => {
    let emoji = '⚪';
    let glowColor = '#3b82f6'; // Default neon blue glow
    
    if (type === 'iss') {
      emoji = '🛰️';
      glowColor = '#60a5fa'; // Light blue
    } else if (type === 'payload') {
      emoji = '📡';
      glowColor = '#38bdf8'; // Cyan
    } else if (riskScore > 1e-4) {
      emoji = '💥';
      glowColor = '#f43f5e'; // Warning red
    } else if (riskScore > 1e-5) {
      emoji = '⚠️';
      glowColor = '#fbbf24'; // Warning amber
    } else {
      emoji = '☄️';
      glowColor = '#64748b'; // Slate grey for normal debris
    }

    const key = `${type}-${emoji}`;
    if (spriteMaterialsRef.current[key]) return spriteMaterialsRef.current[key];

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 64, 64);
    
    // Modern cyberpunk glow outline
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '40px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95
    });

    spriteMaterialsRef.current[key] = material;
    return material;
  };
  
  useEffect(() => {
    debrisRef.current = debris;
  }, [debris]);
  
  // Interaction variables
  const isInteracting = useRef(false);
  const interactionTimeout = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Initialize Scene, Camera, and WebGLRenderer
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 7.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Add Ambient and Directional space lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // 3. OrbitControls Config
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3.2;
    controls.maxDistance = 15.0;
    
    // Listeners to detect when user interacts (stop auto-rotation)
    const setInteracting = () => {
      isInteracting.current = true;
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
      interactionTimeout.current = setTimeout(() => {
        isInteracting.current = false;
      }, 5000); // Resume auto rotation after 5s of inactivity
    };
    controls.addEventListener('start', setInteracting);
    controls.addEventListener('change', setInteracting);
    controlsRef.current = controls;

    // 4. Create Textured Earth Sphere
    const earthRadius = 2.0;
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    
    // Loader with canvas texture generator as direct backup
    const textureLoader = new THREE.TextureLoader();
    let earthMaterial;
    
    try {
      // Free NASA Blue marble texture URL (stable CORS-enabled github proxy fallback)
      const textureUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';
      const earthTex = textureLoader.load(
        textureUrl,
        () => setLoading(false), // loaded successfully
        undefined,
        () => {
          console.warn('[ThreeJS] External texture load failed, loading procedural fallback.');
          earthMaterial.map = createProceduralEarthTexture();
          earthMaterial.needsUpdate = true;
          setLoading(false);
        }
      );
      
      earthMaterial = new THREE.MeshPhongMaterial({
        map: earthTex,
        specular: new THREE.Color(0x333333),
        shininess: 15,
        bumpScale: 0.05,
      });
    } catch (e) {
      earthMaterial = new THREE.MeshPhongMaterial({
        map: createProceduralEarthTexture(),
        specular: new THREE.Color(0x333333),
        shininess: 15
      });
      setLoading(false);
    }

    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    earthRef.current = earth;

    // 5. Add atmospheric glow halo shader
    const glowVertexShader = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const glowFragmentShader = `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
        gl_FragColor = vec4(0.23, 0.51, 0.96, 1.0) * intensity;
      }
    `;

    const glowGeometry = new THREE.SphereGeometry(earthRadius * 1.08, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    const atmosphericGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(atmosphericGlow);

    // 6. Create custom star field background particles
    const starCount = 1500;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 25.0 + Math.random() * 15.0; // Place far away
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      
      starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i + 2] = radius * Math.cos(phi);
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.8
    });
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
    starFieldRef.current = starField;

    // 7. Raycaster click handlers setup
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.15; // Click/Hover tolerance radius
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (event) => {
      // Calculate mouse canvas click dimensions
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      
      if (debrisPointsRef.current) {
        const intersects = raycaster.intersectObjects(debrisPointsRef.current.children);
        if (intersects.length > 0) {
          const noradId = intersects[0].object.userData.noradId;
          if (noradId) {
            onSelectObject(noradId);
          }
        }
      }
    };

    renderer.domElement.addEventListener('click', handleCanvasClick);

    const handlePointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      let found = null;
      if (debrisPointsRef.current) {
        const intersects = raycaster.intersectObjects(debrisPointsRef.current.children);
        if (intersects.length > 0) {
          const noradId = intersects[0].object.userData.noradId;
          if (noradId && debrisRef.current) {
            found = debrisRef.current.find(d => d.noradId === noradId);
          }
        }
      }

      if (found) {
        setHoveredObject(found);
        setTooltipPos({ x: event.clientX, y: event.clientY });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredObject(null);
        renderer.domElement.style.cursor = 'default';
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    // 8. Dynamic Animation Render Loop
    const clock = new THREE.Clock();
    
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = clock.getDelta();

      // Update simulated clock time
      simTimeRef.current += delta * 1000 * timeMultiplierRef.current;
      const currentSimTimeMs = simTimeRef.current;

      // Live Satellites Propagation Animation
      if (debrisPointsRef.current && debrisRef.current && debrisRef.current.length > 0) {
        const children = debrisPointsRef.current.children;
        const scale = 2.0 / 6378.137;
        const GM = 398600.4418;

        debrisRef.current.forEach((obj, idx) => {
          const sprite = children[idx];
          if (!sprite) return;

          if (
            obj.meanMotion !== undefined &&
            obj.inclination !== undefined &&
            obj.raan !== undefined &&
            obj.eccentricity !== undefined &&
            obj.epoch
          ) {
            const epochTimeMs = new Date(obj.epoch).getTime();
            const dtSeconds = (currentSimTimeMs - epochTimeMs) / 1000.0;

            const radI = obj.inclination * Math.PI / 180.0;
            const radRaan = obj.raan * Math.PI / 180.0;
            const nRadPerSec = (obj.meanMotion * 2.0 * Math.PI) / 86400.0;
            const semiMajorAxis = Math.pow(GM / (nRadPerSec * nRadPerSec), 1.0 / 3.0);

            // Mean anomaly
            const M = nRadPerSec * dtSeconds;

            // Solve Kepler's equation E - e sin E = M
            let E = M;
            const ecc = obj.eccentricity;
            for (let k = 0; k < 3; k++) {
              E = E - (E - ecc * Math.sin(E) - M) / (1.0 - ecc * Math.cos(E));
            }

            const xo = semiMajorAxis * (Math.cos(E) - ecc);
            const yo = semiMajorAxis * Math.sqrt(1.0 - ecc * ecc) * Math.sin(E);

            // ECI rotation
            const x = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
            const y = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
            const z = yo * Math.sin(radI);

            sprite.position.set(x * scale, y * scale, z * scale);
          }
        });
      }

      // Earth slow auto rotation (scaled with simulated time warp)
      if (earthRef.current && !isInteracting.current) {
        earthRef.current.rotation.y += 0.025 * delta * (1 + (timeMultiplierRef.current - 1) * 0.05);
      }
      
      // Starfield extremely subtle rotation
      if (starFieldRef.current) {
        starFieldRef.current.rotation.y += 0.005 * delta;
      }

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('click', handleCanvasClick);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      }
      if (rendererRef.current && rendererRef.current.domElement && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (e) {}
      }
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    };
  }, []);

  // 10. Effect: Render/Update Debris Objects on Globe
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !debris || debris.length === 0) return;

    // Remove existing debris points mesh
    if (debrisPointsRef.current) {
      scene.remove(debrisPointsRef.current);
      debrisPointsRef.current = null;
    }

    const group = new THREE.Group();
    const scale = 2.0 / 6378.137;

    debris.forEach((obj) => {
      let x = obj.x;
      let y = obj.y;
      let z = obj.z;

      if (x === undefined) {
        // Fallback geodetic to Cartesian Conversion
        const radLat = obj.lat * Math.PI / 180.0;
        const radLon = obj.lon * Math.PI / 180.0;
        const r = 6378.137 + obj.alt;
        x = r * Math.cos(radLat) * Math.cos(radLon);
        y = r * Math.cos(radLat) * Math.sin(radLon);
        z = r * Math.sin(radLat);
      }

      // Identify sprite type based on name or NORAD ID
      let type = 'debris';
      if (obj.name.toLowerCase().includes('iss') || obj.noradId === '25544') {
        type = 'iss';
      } else if (obj.name.toLowerCase().includes('deb') || obj.name.toLowerCase().includes('debris')) {
        type = 'debris';
      } else {
        type = 'payload';
      }

      const material = getSpriteMaterial(type, obj.riskScore);
      const sprite = new THREE.Sprite(material);
      
      // Futuristic dynamic size hierarchy to declutter orbit layers
      let scaleSize = 0.065;
      if (type === 'iss') scaleSize = 0.11;
      else if (type === 'payload') scaleSize = 0.08;
      else if (obj.riskScore > 1e-5) scaleSize = 0.10; // Conjunction alarms stand out
      
      sprite.scale.set(scaleSize, scaleSize, 1);
      sprite.position.set(x * scale, y * scale, z * scale);
      
      // Save data in userData for raycasting lookup
      sprite.userData = { noradId: obj.noradId };
      
      group.add(sprite);
    });

    scene.add(group);
    debrisPointsRef.current = group;

  }, [debris]);

  // 11. Effect: Draw Selected Debris Orbital Track Paths (Support Multiple)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old orbit lines
    if (orbitLineRef.current && Array.isArray(orbitLineRef.current)) {
      orbitLineRef.current.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
      });
      orbitLineRef.current = [];
    } else if (orbitLineRef.current) {
      scene.remove(orbitLineRef.current);
      orbitLineRef.current.geometry.dispose();
      orbitLineRef.current = null;
    }

    if (!selectedObjects || selectedObjects.length === 0) return;

    orbitLineRef.current = [];

    selectedObjects.forEach((obj, idx) => {
      if (!obj || 
          obj.meanMotion === undefined || 
          obj.inclination === undefined || 
          isNaN(obj.meanMotion) || 
          isNaN(obj.inclination)) {
        return;
      }
      
      const pointsCount = 128;
      const pathPositions = [];
      
      const radI = obj.inclination * Math.PI / 180.0;
      const radRaan = obj.raan * Math.PI / 180.0;
      
      const GM = 398600.4418;
      const nRadPerSec = (obj.meanMotion * 2 * Math.PI) / 86400;
      const semiMajorAxis = Math.pow(GM / (nRadPerSec * nRadPerSec), 1/3);
      const eccentricityFactor = Math.sqrt(1.0 - obj.eccentricity * obj.eccentricity);
      const scale = 2.0 / 6378.137;

      for (let j = 0; j <= pointsCount; j++) {
        const u = (j / pointsCount) * 2.0 * Math.PI;
        const xo = semiMajorAxis * Math.cos(u);
        const yo = semiMajorAxis * Math.sin(u) * eccentricityFactor;

        const xEci = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
        const yEci = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
        const zEci = yo * Math.sin(radI);

        pathPositions.push(new THREE.Vector3(xEci * scale, yEci * scale, zEci * scale));
      }

      const color = obj.isManeuver 
        ? 0x10b981 // Emerald green for the evasion maneuver path
        : (idx === 0 ? 0xffffff : 0xffa500); // white for primary, orange for challenger
        
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(pathPositions);
      const orbitMaterial = obj.isManeuver
        ? new THREE.LineDashedMaterial({
            color: color,
            dashSize: 0.08,
            gapSize: 0.04,
            scale: 1,
            transparent: true,
            opacity: 0.85
          })
        : new THREE.LineBasicMaterial({
            color: color,
            linewidth: idx === 0 ? 1.5 : 1.2,
            transparent: true,
            opacity: 0.65
          });

      const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
      if (obj.isManeuver) {
        orbitLine.computeLineDistances(); // Compute distance metric for dashed lines
      }
      scene.add(orbitLine);
      orbitLineRef.current.push(orbitLine);
    });

  }, [selectedObjects]);

  // 12. Effect: Draw reference orbital bands LEO / MEO / GEO
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (bandsGroupRef.current) {
      scene.remove(bandsGroupRef.current);
      bandsGroupRef.current.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      bandsGroupRef.current = null;
    }

    if (!showBands) return;

    const group = new THREE.Group();
    const scale = 2.0 / 6378.137;
    const earthRadius = 2.0;

    const bands = [
      { name: 'LEO Band (1,000 km)', alt: 1000, color: 0x00ffff },
      { name: 'MEO Band (20,200 km)', alt: 20200, color: 0xd946ef },
      { name: 'GEO Band (35,786 km)', alt: 35786, color: 0x00ff88 },
    ];

    bands.forEach(band => {
      const radius = earthRadius + band.alt * scale;
      const pointsCount = 128;
      const points = [];

      for (let i = 0; i <= pointsCount; i++) {
        const theta = (i / pointsCount) * Math.PI * 2;
        points.push(new THREE.Vector3(radius * Math.cos(theta), 0, radius * Math.sin(theta)));
      }

      const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const ringMaterial = new THREE.LineDashedMaterial({
        color: band.color,
        dashSize: 0.15,
        gapSize: 0.08,
        scale: 1,
        transparent: true,
        opacity: 0.5
      });

      const ringLine = new THREE.Line(ringGeometry, ringMaterial);
      ringLine.computeLineDistances();
      group.add(ringLine);

      // Polar ring for LEO grid alignment
      if (band.alt === 1000) {
        const polarPoints = [];
        for (let i = 0; i <= pointsCount; i++) {
          const theta = (i / pointsCount) * Math.PI * 2;
          polarPoints.push(new THREE.Vector3(0, radius * Math.cos(theta), radius * Math.sin(theta)));
        }
        const polarGeometry = new THREE.BufferGeometry().setFromPoints(polarPoints);
        const polarLine = new THREE.Line(polarGeometry, ringMaterial);
        polarLine.computeLineDistances();
        group.add(polarLine);
      }
    });

    scene.add(group);
    bandsGroupRef.current = group;

    return () => {
      if (bandsGroupRef.current) {
        scene.remove(bandsGroupRef.current);
        bandsGroupRef.current.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        bandsGroupRef.current = null;
      }
    };
  }, [showBands]);

  return (
    <div className="w-full h-full relative earth-container flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a] z-50 transition-opacity duration-500">
          <div className="orbital-spinner flex items-center justify-center">
            <div className="orbital-inner"></div>
          </div>
          <span className="mt-6 font-display font-medium text-blue-400 animate-pulse tracking-widest text-sm uppercase">
            Initializing 3D Space Scene...
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full z-10" />

      {/* Floating Toggle Controls on Globe */}
      <div className="absolute right-6 top-6 z-30 flex flex-col gap-2">
        <button
          onClick={() => setShowBands(!showBands)}
          className={`px-3 py-1.5 rounded-lg border font-mono text-[9px] uppercase tracking-wider transition-all backdrop-blur-md ${
            showBands 
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
              : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white hover:bg-slate-950/80'
          }`}
        >
          Reference Bands: {showBands ? 'ON' : 'OFF'}
        </button>

        {/* Time Warp Console */}
        <div className="bg-slate-950/80 border border-white/5 rounded-lg p-2.5 flex flex-col gap-1.5 backdrop-blur-md shadow-lg w-[130px]">
          <span className="text-[7.5px] uppercase font-bold text-slate-500 tracking-wider text-center font-mono block mb-1">
            Time Warp Console
          </span>
          <div className="grid grid-cols-2 gap-1">
            {[1, 10, 100, 500, 1000].map((mult) => (
              <button
                key={mult}
                onClick={() => setTimeMultiplier(mult)}
                className={`py-1 rounded text-[8px] font-mono transition-all font-bold ${
                  timeMultiplier === mult
                    ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                    : 'bg-slate-900/45 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-800/60'
                } ${mult === 1 ? 'col-span-2' : ''}`}
              >
                {mult === 1 ? 'REALTIME 1X' : `${mult}X`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating HTML Telemetry Tooltip */}
      {hoveredObject && (
        <div 
          className="fixed pointer-events-none z-50 bg-[#060913]/90 border border-blue-500/50 rounded-lg p-2.5 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md text-[10px] font-mono text-left text-slate-100 flex flex-col gap-1 min-w-[150px]"
          style={{
            left: `${tooltipPos.x + 12}px`,
            top: `${tooltipPos.y + 12}px`,
          }}
        >
          <div className="font-bold text-blue-400 border-b border-blue-500/20 pb-1 mb-1 truncate flex items-center gap-1.5 justify-between">
            <span className="truncate">{hoveredObject.name}</span>
            {hoveredObject.riskScore > 1e-5 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            )}
          </div>
          <div><span className="text-slate-500 font-semibold">NORAD:</span> <span className="text-slate-300">{hoveredObject.noradId}</span></div>
          <div><span className="text-slate-500 font-semibold">ALTITUDE:</span> <span className="text-slate-300">{(hoveredObject.alt !== undefined ? hoveredObject.alt : hoveredObject.altitudeKm)?.toFixed(1)} km</span></div>
          <div><span className="text-slate-500 font-semibold">INCLINATION:</span> <span className="text-slate-300">{hoveredObject.inclination.toFixed(2)}°</span></div>
          {hoveredObject.riskScore > 0 && (
            <div>
              <span className="text-slate-500 font-semibold">RISK Score:</span>{' '}
              <span className={`font-bold ${hoveredObject.riskScore > 1e-4 ? 'text-rose-400' : 'text-amber-400'}`}>
                {hoveredObject.riskScore.toExponential(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
