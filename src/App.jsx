import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

const ALICE_MODEL_URL = 'https://alicealpha.onrender.com/alice.glb';

function fitModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.001);
  const scale = 2.15 / height;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale - 1.08, -center.z * scale);
}

export default function App() {
  const mountRef = useRef(null);
  const speakingRef = useRef(false);
  const [status, setStatus] = useState('Alice wird geladen …');
  const [speaking, setSpeaking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090c');
    scene.fog = new THREE.Fog('#07090c', 5, 10);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    camera.position.set(0, 0.45, 4.8);
    camera.lookAt(0, 0.25, 0);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);
    } catch (err) {
      const message = err?.message || String(err) || 'WebGL konnte nicht initialisiert werden';
      setLoaded(false);
      setError(`Renderer: ${message}`);
      setStatus('Alice Renderer nicht verfügbar');
      return undefined;
    }

    const hemi = new THREE.HemisphereLight('#d6e7ff', '#17100d', 1.6);
    scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff1e6', 3.4);
    key.position.set(2.8, 4.2, 3.4);
    key.castShadow = true;
    scene.add(key);

    const rim = new THREE.DirectionalLight('#9fc8ff', 2.3);
    rim.position.set(-3.2, 2.5, -2.6);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 96),
      new THREE.MeshStandardMaterial({ color: '#11151b', roughness: 0.92, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.08;
    floor.receiveShadow = true;
    scene.add(floor);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.62, 1.64, 128),
      new THREE.MeshBasicMaterial({ color: '#b7d8ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    halo.position.set(0, 0.42, -1.25);
    scene.add(halo);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let modelRoot = null;
    let vrm = null;
    let disposed = false;
    let frame = 0;
    const clock = new THREE.Clock();
    let nextBlinkAt = 1.5 + Math.random() * 2.5;
    let blinkStarted = -1;

    loader.load(
      ALICE_MODEL_URL,
      (gltf) => {
        if (disposed) return;
        vrm = gltf.userData?.vrm ?? null;
        modelRoot = vrm?.scene ?? gltf.scene;
        fitModel(modelRoot);
        modelRoot.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = false;
          }
        });
        scene.add(modelRoot);
        setLoaded(true);
        setError('');
        setStatus(vrm ? 'Alice online · VRM aktiv' : 'Alice online · GLB aktiv');
      },
      (event) => {
        if (!event.total) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        setStatus(`Alice wird geladen … ${pct}%`);
      },
      (err) => {
        if (disposed) return;
        const message = err?.message || 'Unbekannter Ladefehler';
        setLoaded(false);
        setError(message);
        setStatus('Alice konnte nicht geladen werden');
      },
    );

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = () => {
      frame = requestAnimationFrame(render);
      const delta = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      if (modelRoot) {
        modelRoot.rotation.y = Math.sin(t * 0.42) * 0.028;
        modelRoot.position.y += (Math.sin(t * 1.05) * 0.008 - (modelRoot.position.y + 1.08)) * Math.min(delta * 2.2, 1);
      }

      if (vrm) {
        vrm.update(delta);
        const expressions = vrm.expressionManager;
        if (expressions) {
          if (t >= nextBlinkAt && blinkStarted < 0) blinkStarted = t;
          if (blinkStarted >= 0) {
            const phase = (t - blinkStarted) / 0.18;
            const blink = phase < 0.5 ? phase * 2 : Math.max(0, (1 - phase) * 2);
            expressions.setValue('blink', blink);
            if (phase >= 1) {
              expressions.setValue('blink', 0);
              blinkStarted = -1;
              nextBlinkAt = t + 2 + Math.random() * 3.8;
            }
          }

          const talk = speakingRef.current ? (Math.sin(t * 13.4) + 1) * 0.5 : 0;
          expressions.setValue('aa', speakingRef.current ? 0.22 + talk * 0.55 : 0);
          expressions.setValue('ih', speakingRef.current ? (1 - talk) * 0.22 : 0);
          expressions.setValue('ou', speakingRef.current ? talk * 0.14 : 0);
        }
      }

      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener('resize', resize);
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose?.();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose?.());
        }
      });
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="stage-card">
        <div className="brand-row">
          <div>
            <p className="eyebrow">ALICE / GREENFIELD MVP</p>
            <h1>Alice</h1>
          </div>
          <span className={`status-dot ${loaded ? 'ok' : error ? 'error' : ''}`} aria-hidden="true" />
        </div>

        <div className="viewport" ref={mountRef}>
          <div className="status-pill">{status}</div>
          {error && (
            <div className="error-card">
              <strong>Kein Dummy-Fallback.</strong>
              <span>Der echte Alice-Asset-Load ist fehlgeschlagen.</span>
              <code>{error}</code>
            </div>
          )}
        </div>

        <div className="control-row">
          <button
            type="button"
            disabled={!loaded}
            className={speaking ? 'active' : ''}
            onClick={() => setSpeaking((value) => !value)}
          >
            {speaking ? 'Sprechen stoppen' : 'Viseme-Test'}
          </button>
          <div className="pipeline">
            <span>Mic</span><i />
            <span>Whisper</span><i />
            <span>LLM</span><i />
            <span>Piper</span>
          </div>
        </div>
      </section>
    </main>
  );
}
