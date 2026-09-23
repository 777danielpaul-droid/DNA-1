import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { RefObject } from 'react';

interface StrandParticleParam {
  curve: THREE.CatmullRomCurve3;
  uParam: number;
  speed: number;
}

export function initDnaScene(
  containerElement: HTMLElement,
  landingPageRef: RefObject<HTMLDivElement | null>,
  isDark: boolean = true
): () => void {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    // Kamera muss Teil des Scenegraphs sein, damit ihre Kind-Objekte
    // (die Hintergrundbild-Quads weiter unten) mitgerendert werden.
    scene.add(camera);

    // Solides Scene-Background bleibt (Fallback-Farbe, solange kein
    // Hintergrundbild aktiv ist — siehe backgroundQuads weiter unten).
    scene.background = new THREE.Color(isDark ? 0x000002 : 0xf8fafc);

    // Theme-aware ambient light
    const ambientLight = new THREE.AmbientLight(
        isDark ? 0x00f0ff : 0xa855f7,
        isDark ? 0.4 : 0.55
    );
    scene.add(ambientLight);

    // Directional fill light
    const directionalLight = new THREE.DirectionalLight(
        isDark ? 0xffffff : 0x94a3b8,
        isDark ? 0.6 : 0.85
    );
    directionalLight.position.set(0, 10, 15);
    scene.add(directionalLight);

    // Theme-aware bloom
    const bloomStrength = isDark ? 1.1 : 0.3;
    const bloomThreshold = isDark ? 0.15 : 0.7;
    const bloomRadius = isDark ? 0.55 : 0.5;

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloomStrength, bloomRadius, bloomThreshold
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(isDark ? 0x000002 : 0xf8fafc, 1.0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.4 : 1.1;
    containerElement.appendChild(renderer.domElement);

    const composer = isDark ? new EffectComposer(renderer) : null;
    if (composer) {
        composer.addPass(renderScene);
        composer.addPass(bloomPass);
    }

    // --- Story-Hintergrundbilder (ab Sequenz 2 / Sequenz 5) ---
    // Werden direkt als Objekte in der Szene gerendert (statt per CSS/
    // transparentem Canvas dahinter) — so laufen sie ganz normal durch die
    // reguläre WebGL-Pipeline mit und es gibt keine Probleme mit Canvas-
    // Transparenz, die der Bloom-Composite-Schritt sonst überschreiben würde.
    // Timing passend zu SEQUENCES/getActiveIndex in InfoCircuitNode.tsx:
    // Sequenz 2 (i=1) = 0.19. Das dritte Bildpaar sitzt genau zwischen den
    // beiden bestehenden Einblendungen, kurz nachdem Sequenz 3 endet (0.40)
    // bzw. mit dem Einsetzen von Sequenz 4 (0.41). Das vierte/letzte Bild
    // erscheint bewusst spät, aber noch deutlich vor dem DNA-Strang-
    // Ausblenden/EndSplash (ca. 67% Scroll-Progress).
    // Die Bilder selbst bleiben bewusst nur kurz sichtbar.
    const BG_SEQ2_START = 0.19;
    const BG_SEQ_MID_START = 0.41;
    const BG_SEQ5_START = 0.67;
    // Kürzere, prägnantere Einblendungen: die Bilder blitzen nur kurz
    // während der passenden DNA-Sequenz auf.
    const BG_DISPLAY_WINDOW = 0.138;
    const BG_FADE_WINDOW = 0.022;
    function smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    const BG_SEQ2_URL = '/bg-seq2.jpg';
    const BG_SEQ_MID_URL = isDark ? '/bg-seq-mid-dark.jpg' : '/bg-seq-mid-light.jpg';
    const BG_SEQ5_URL = isDark ? '/bg-seq5-dark.jpg' : '/bg-seq5-light.jpg';

    const textureLoader = new THREE.TextureLoader();
    const bgSeq2Texture = textureLoader.load(BG_SEQ2_URL);
    const bgSeqMidTexture = textureLoader.load(BG_SEQ_MID_URL);
    const bgSeq5Texture = textureLoader.load(BG_SEQ5_URL);
    bgSeq2Texture.colorSpace = THREE.SRGBColorSpace;
    bgSeqMidTexture.colorSpace = THREE.SRGBColorSpace;
    bgSeq5Texture.colorSpace = THREE.SRGBColorSpace;
    // Zweites Story-Bild horizontal spiegeln, ohne die DNA-/Kamera-Geometrie
    // zu verändern. repeat.x=-1 dreht nur die Textur selbst um.
    bgSeq5Texture.wrapS = THREE.RepeatWrapping;
    bgSeq5Texture.repeat.x = -1;
    bgSeq5Texture.offset.x = 1;

    // Tief hinter der eigentlichen DNA-Geometrie, aber innerhalb camera.far (2000).
    const BG_QUAD_DEPTH = 1500;
    function makeBackgroundQuad(texture: THREE.Texture, renderOrder: number, colorTint = 1) {
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(colorTint, colorTint, colorTint),
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            toneMapped: false, // Foto soll nicht vom ACES-Tonemapping verändert werden
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.renderOrder = renderOrder;
        mesh.position.set(0, 0, -BG_QUAD_DEPTH);
        camera.add(mesh);
        return mesh;
    }
    // renderOrder sehr niedrig: zeichnet zuerst, DNA-Stränge (additive
    // Blends) landen optisch darüber.
    // bg-seq2 im Dark Mode zusätzlich abgedunkelt (colorTint 0.45): die hellen
    // Stellen (Haare/Sternennetz) lagen über der Bloom-Schwelle und wurden
    // dadurch zusätzlich verstärkt/"leuchtend" — mit gedämpfter Grundhelligkeit
    // bleibt weniger davon über der Schwelle.
    const bgSeq2Mesh = makeBackgroundQuad(bgSeq2Texture, -1000, isDark ? 0.45 : 1);
    const bgSeqMidMesh = makeBackgroundQuad(bgSeqMidTexture, -999);
    const bgSeq5Mesh = makeBackgroundQuad(bgSeq5Texture, -998);

    function updateBackgroundQuadSize() {
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const fullHeight = 2 * Math.tan(vFov / 2) * BG_QUAD_DEPTH;
        const fullWidth = fullHeight * camera.aspect;

        // Alle drei Bilder in voller Bildschirmgröße, zentriert.
        [bgSeq2Mesh, bgSeqMidMesh, bgSeq5Mesh].forEach((mesh) => {
            mesh.scale.set(fullWidth, fullHeight, 1);
            mesh.position.set(0, 0, -BG_QUAD_DEPTH);
        });
    }
    updateBackgroundQuadSize();

    // Maximale Deckkraft im Peak — Bilder sollen nur ganz leicht/kaum
    // sichtbar durchscheinen, nicht deutlich erkennbar sein.
    const BG_MAX_OPACITY = 0.07;

    // Kurzes, organisches Flimmern statt eines statischen Fade-ins. Das zweite
    // Bild nutzt denselben Effekt, startet aber später im Flug, aber etwas früher als in der vorherigen Version.
    // Der Effekt ist deterministisch und damit beim Scrollen reproduzierbar.
    function flickerEnvelope(progress: number, start: number): number {
        const local = progress - start;
        if (local < 0 || local > BG_DISPLAY_WINDOW) return 0;

        const fadeIn = smoothstep(0, BG_FADE_WINDOW, local);
        const fadeOut = 1 - smoothstep(
            BG_DISPLAY_WINDOW - BG_FADE_WINDOW,
            BG_DISPLAY_WINDOW,
            local
        );

        // Mehrere Frequenzen ergeben ein leicht unregelmäßiges Sci-Fi-Flimmern.
        const flicker =
            0.62 +
            0.20 * Math.sin(local * 420) +
            0.11 * Math.sin(local * 910 + 1.7) +
            0.07 * Math.sin(local * 1630 + 0.4);

        return Math.max(0.12, Math.min(1, fadeIn * fadeOut * flicker));
    }

    // Eigene, etwas kräftigere Obergrenze für die CSS-Ebene im Chatfenster —
    // unabhängig von BG_MAX_OPACITY (das ist absichtlich sehr dezent, damit
    // die WebGL-Quads die DNA-Geometrie nicht überstrahlen). Im Glas darf es
    // ruhig deutlicher durchscheinen.
    const CHAT_FLICKER_MAX_OPACITY = 0.35;

    function updateBackgroundOpacity(progress: number) {
        const seq2Opacity = flickerEnvelope(progress, BG_SEQ2_START);
        const seqMidOpacity = flickerEnvelope(progress, BG_SEQ_MID_START);
        const seq5Opacity = flickerEnvelope(progress, BG_SEQ5_START);

        (bgSeq2Mesh.material as THREE.MeshBasicMaterial).opacity = seq2Opacity * BG_MAX_OPACITY;
        (bgSeqMidMesh.material as THREE.MeshBasicMaterial).opacity = seqMidOpacity * BG_MAX_OPACITY;
        (bgSeq5Mesh.material as THREE.MeshBasicMaterial).opacity = seq5Opacity * BG_MAX_OPACITY;

        // --- Dieselbe Sequenz zusätzlich als CSS-Ebene fürs Chatfenster ---
        // Von den drei Envelopes gewinnt die gerade stärkste (meist ist ohnehin
        // nur eine ungleich 0, die Fenster überlappen sich nicht) — ihr Bild
        // und ihre Deckkraft werden auf document.body gespiegelt, damit
        // .gemini-chat-panel__flicker (liegt an anderer Stelle im DOM als
        // #canvas-container) sie per CSS-Variable lesen kann.
        let activeUrl: string | null = null;
        let activeOpacity = 0;
        let activeFlip = 1;
        if (seq2Opacity > 0 && seq2Opacity >= seqMidOpacity && seq2Opacity >= seq5Opacity) {
            activeUrl = BG_SEQ2_URL;
            activeOpacity = seq2Opacity;
        } else if (seqMidOpacity > 0 && seqMidOpacity >= seq5Opacity) {
            activeUrl = BG_SEQ_MID_URL;
            activeOpacity = seqMidOpacity;
        } else if (seq5Opacity > 0) {
            activeUrl = BG_SEQ5_URL;
            activeOpacity = seq5Opacity;
            activeFlip = -1; // bg-seq5 ist in der Three.js-Szene horizontal gespiegelt (repeat.x = -1)
        }

        document.body.style.setProperty(
            '--chat-flicker-image',
            activeUrl ? `url('${activeUrl}')` : 'none'
        );
        document.body.style.setProperty(
            '--chat-flicker-opacity',
            (activeOpacity * CHAT_FLICKER_MAX_OPACITY).toString()
        );
        document.body.style.setProperty('--chat-flicker-flip', activeFlip.toString());
    }

    // --- DNA-Strang-Flackern über die gesamte Fluglänge ---
    // Gleiches Sci-Fi-Flimmer-Prinzip wie bei den Story-Hintergrundbildern,
    // aber deutlich kräftiger (viel höhere Peak-Sichtbarkeit, tiefere Einbrüche)
    // und nicht nur in einem kurzen Fenster, sondern durchgehend über den
    // ganzen Flug hinweg. Gilt für den ganzen "DNA-Strang" im weiteren Sinne:
    // die beiden Haupt-Stränge (mat1/mat2), die Brücken (bridgeMeshes) und die
    // Trail-Partikel entlang der gesamten Strang-Länge (strandParticleMat).
    // Ausblenden ist zeitlich in der Nähe des dritten Story-Bilds platziert,
    // aber mit etwas Abstand danach (siehe STRAND_FADE_START/END oben) und
    // bleibt für den Rest des Flugs unsichtbar.
    const STRAND_FLICKER_MIN = 0.25;
    // Etwas später als das Einblenden des dritten Story-Bilds selbst (das
    // sofortige Zusammenfallen war zu früh) — der Strang blendet stattdessen
    // aus, nachdem das Bild schon eine Weile zu sehen war.
    const STRAND_FADE_START = 0.56;
    const STRAND_FADE_END = 0.70;
    function strandFlickerOpacity(progress: number): number {
        // Deterministisch über progress statt Zeit — reproduzierbar beim
        // Scrollen, exakt wie flickerEnvelope() oben. Größere Amplituden und
        // niedrigerer Grundwert als zuvor → kräftigeres, tieferes Flackern.
        const flicker =
            0.75 +
            0.28 * Math.sin(progress * 900) +
            0.16 * Math.sin(progress * 1900 + 1.1) +
            0.10 * Math.sin(progress * 3300 + 0.5);

        const fadeOut = 1 - smoothstep(STRAND_FADE_START, STRAND_FADE_END, progress);
        return Math.max(STRAND_FLICKER_MIN, Math.min(1, flicker)) * fadeOut;
    }

    function updateStrandOpacity(progress: number) {
        const opacity = strandFlickerOpacity(progress);
        (mat1.uniforms.opacity.value as number) = opacity;
        (mat2.uniforms.opacity.value as number) = opacity;
        bridgeMeshes.forEach((mesh) => {
            ((mesh.material as THREE.ShaderMaterial).uniforms.opacity.value as number) = opacity;
        });
        (strandParticleMat.uniforms.opacity.value as number) = opacity;
    }

    const curvePoints: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 400),
        new THREE.Vector3(60, 10, 200),
        new THREE.Vector3(-60, 10, 0),
        new THREE.Vector3(0, 15, -200),
        new THREE.Vector3(0, 300, -280)
    ];
    const flightCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.5);

    const helixRadius = 18;
    const turns = 8.0;
    const totalSegments = 500;
    const numPieces = 24;

    // Einfaches LOD: weniger Partikel auf Mobile für Performance
    const isMobileDevice = window.innerWidth <= 768;
    const particleCount = isMobileDevice ? 500 : 1100;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for(let i = 0; i < particleCount * 3; i += 3) {
        particlePositions[i] = (Math.random() - 0.5) * 450;
        particlePositions[i+1] = (Math.random() - 0.5) * 300;
        particlePositions[i+2] = (Math.random() - 0.5) * 1200;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
        color: isDark ? 0x2f5bd6 : 0x1e40af, // dunkelblau dark / blau light, kein Lila/Pink
        size: isDark ? 1.1 : 1.1,
        transparent: true,
        blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: isDark ? 0.85 : 0.45
    });
    const ambientParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(ambientParticles);

    const HSL_HELPER = `vec3 hsl2rgb(vec3 c) {
        vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
        return c.z + c.y * (clamp(p - 1.0, 0.0, 1.0) - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
    }`;

    const bioShaderMaterial = (baseHue: number): THREE.ShaderMaterial => {
        const vs = `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vRadiusDist;
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                float angle = vUv.x * 6.2831853;
                vRadiusDist = abs(cos(angle));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fs = `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vRadiusDist;
            uniform float time;
            uniform float baseHue;
            uniform float opacity;
            ${HSL_HELPER}
            void main() {
                float wave1 = sin(vUv.x * 35.0 - time * 3.0);
                float wave2 = cos(vUv.y * 15.0 + time * 2.0);
                float wave3 = sin(vPosition.z * 0.05 - time * 4.0);
                float pulse = (wave1 * 0.4 + wave2 * 0.3 + wave3 * 0.3);

                // Saturated strand color per baseHue (violett vs. cyan), pulsierend
                float intensity = 0.55 + 0.45 * pulse;
                vec3 strandColor = hsl2rgb(vec3(baseHue, 0.95, 0.55 * intensity));

                // Heller weißer Kern in der Tube-Mitte für Punch
                float coreHot = smoothstep(0.55, 1.0, 1.0 - vRadiusDist) * (0.5 + 0.5 * pulse);
                vec3 hotCore = vec3(1.0) * coreHot;

                // Äußerer Rand-Glow in Akzentfarbe
                float glowStrength = pow(1.0 - vRadiusDist, 1.5) * (0.6 + 0.4 * pulse);
                vec3 edgeGlow = hsl2rgb(vec3(baseHue, 1.0, 0.5)) * glowStrength;

                vec3 biolomColor = strandColor + hotCore + edgeGlow * 0.8;

                // Zusätzliches lokales Flimmern der Transparenz entlang des
                // gesamten Strangs — unabhängig vom globalen Ein-/Ausblenden
                // (uniform opacity): jeder Punkt entlang der Tube-Länge und
                // der Zeit bekommt sein eigenes Schimmern, statt dass der
                // ganze Strang synchron im Block flackert.
                float localFlicker = 0.62
                    + 0.38 * sin(vPosition.z * 0.55 + time * 17.0)
                    * cos(vUv.x * 30.0 - time * 9.0 + baseHue * 20.0);
                localFlicker = clamp(localFlicker, 0.3, 1.0);

                // Genauso transparent wie die Brücken (siehe bridgeShaderMaterial
                // weiter unten) — die Doppelhelix soll nur noch leicht
                // schimmern, nicht mehr voll sichtbar sein. Gleiche
                // z-abhängige Basis-Opazität (3% vorne, max. 15% hinten).
                float baseOpacity = 0.03 + 0.12 * clamp((400.0 - vPosition.z) / 680.0, 0.0, 1.0);

                gl_FragColor = vec4(biolomColor, baseOpacity * opacity * localFlicker);
            }
        `;

        return new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, baseHue: { value: baseHue }, opacity: { value: 1 } },
            vertexShader: vs,
            fragmentShader: fs,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
    };

    const bridgeShaderMaterial = (): THREE.ShaderMaterial => {
        const vs = `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fs = `
            varying vec2 vUv;
            varying vec3 vPosition;
            uniform float time;
            uniform float opacity;
            ${HSL_HELPER}
            void main() {
                vec3 baseColor = hsl2rgb(vec3(0.66, 0.9, 0.16));
                float cyberWave = sin(vPosition.z * 0.08 - time * 5.0);
                if (cyberWave > 0.6) {
                    float mixFactor = (cyberWave - 0.6) / 0.4;
                    vec3 accentColor = hsl2rgb(vec3(0.66, 1.0, 0.5));
                    baseColor = mix(baseColor, accentColor, mixFactor);
                }
                // Front minimal sichtbar (3%), hinten max. 15% — noch transparenter
                float baseOpacity = 0.03 + 0.12 * clamp((400.0 - vPosition.z) / 680.0, 0.0, 1.0);

                // Gleiches lokales Transparenz-Flimmern wie beim Hauptstrang,
                // entlang der gesamten Brückenlänge.
                float localFlicker = 0.62
                    + 0.38 * sin(vPosition.z * 0.55 + time * 17.0)
                    * cos(vUv.x * 30.0 - time * 9.0);
                localFlicker = clamp(localFlicker, 0.3, 1.0);

                gl_FragColor = vec4(baseColor, baseOpacity * opacity * localFlicker);
            }
        `;

        return new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, opacity: { value: 1 } },
            vertexShader: vs,
            fragmentShader: fs,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending
        });
    };

    const curvePoints1: THREE.Vector3[] = [];
    const curvePoints2: THREE.Vector3[] = [];

    for (let i = 0; i <= totalSegments; i++) {
        const u = i / totalSegments;
        const curvePoint = flightCurve.getPoint(u);
        const tangent = flightCurve.getTangent(u);
        const angle = u * Math.PI * 2 * turns;

        const normal = new THREE.Vector3(0, 1, 0);
        normal.cross(tangent).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        const cx1 = Math.cos(angle) * helixRadius;
        const cz1 = Math.sin(angle) * helixRadius;
        curvePoints1.push(new THREE.Vector3(
            curvePoint.x + (normal.x * cx1 + binormal.x * cz1),
            curvePoint.y + (normal.y * cx1 + binormal.y * cz1),
            curvePoint.z + (normal.z * cx1 + binormal.z * cz1)
        ));

        const cx2 = Math.cos(angle + Math.PI) * helixRadius;
        const cz2 = Math.sin(angle + Math.PI) * helixRadius;
        curvePoints2.push(new THREE.Vector3(
            curvePoint.x + (normal.x * cx2 + binormal.x * cz2),
            curvePoint.y + (normal.y * cx2 + binormal.y * cz2),
            curvePoint.z + (normal.z * cx2 + binormal.z * cz2)
        ));
    }

    const mainCurve1 = new THREE.CatmullRomCurve3(curvePoints1);
    const mainCurve2 = new THREE.CatmullRomCurve3(curvePoints2);

    const strandGroup1 = new THREE.Group();
    const strandGroup2 = new THREE.Group();
    const assemblyPieces: THREE.Mesh[] = [];

    const segmentStep = totalSegments / numPieces;
    const mat1 = bioShaderMaterial(isDark ? 0.66 : 0.49); // Blau-Violett dark / Tiffany Blau light
    const mat2 = bioShaderMaterial(isDark ? 0.68 : 0.50); // fast identischer Ton, minimale Tiefe zw. den Strängen

    for (let p = 0; p < numPieces; p++) {
        const startIdx = Math.floor(p * segmentStep);
        const endIdx = Math.min(Math.floor((p + 1) * segmentStep) + 2, totalSegments);

        const subPoints1 = curvePoints1.slice(startIdx, endIdx);
        const subPoints2 = curvePoints2.slice(startIdx, endIdx);

        if (subPoints1.length < 2) continue;

        const subCurve1 = new THREE.CatmullRomCurve3(subPoints1);
        const subCurve2 = new THREE.CatmullRomCurve3(subPoints2);

        const tubeGeo1 = new THREE.TubeGeometry(subCurve1, 25, 1.4, 12, false);
        const tubeGeo2 = new THREE.TubeGeometry(subCurve2, 25, 1.4, 12, false);

        const mesh1 = new THREE.Mesh(tubeGeo1, mat1);
        const mesh2 = new THREE.Mesh(tubeGeo2, mat2);

        const scatterOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 220,
            (Math.random() - 0.5) * 160 + 60,
            (Math.random() - 0.5) * 220
        );

        mesh1.userData = { pieceIndex: p, scatterOffset: scatterOffset.clone() };
        mesh2.userData = { pieceIndex: p, scatterOffset: scatterOffset.clone().negate() };

        strandGroup1.add(mesh1);
        strandGroup2.add(mesh2);
        assemblyPieces.push(mesh1, mesh2);
    }

    scene.add(strandGroup1);
    scene.add(strandGroup2);

    const bridgeGroup = new THREE.Group();
    const bridgeCount = 90;
    const bridgeMeshes: THREE.Mesh[] = [];

    for (let i = 0; i < bridgeCount; i++) {
        const u = i / bridgeCount;
        const p1 = mainCurve1.getPoint(u);
        const p2 = mainCurve2.getPoint(u);

        const bridgeCurve = new THREE.CatmullRomCurve3([p1, p2]);
        const bridgeGeo = new THREE.TubeGeometry(bridgeCurve, 12, 0.5, 8, false);
        const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeShaderMaterial());

        bridgeMeshes.push(bridgeMesh);
        bridgeGroup.add(bridgeMesh);
    }
    scene.add(bridgeGroup);

    const isMobileForTrails = window.innerWidth <= 768;
    const strandParticleCount = isMobileForTrails ? 90 : 200;
    const strandParticleGeo = new THREE.BufferGeometry();
    const strandParticlePositions = new Float32Array(strandParticleCount * 3);
    const strandParticleSeeds = new Float32Array(strandParticleCount);
    const strandParticleHues = new Float32Array(strandParticleCount);
    const strandParticleParams: StrandParticleParam[] = [];

    // Trail-Partikel jetzt über die GESAMTE Helix-Länge verteilt (vorher nur
    // im letzten Drittel, strandStartU=0.7 bis 1.0).
    const strandStartU = 0.0;
    const strandEndU = 1.0;

    for (let i = 0; i < strandParticleCount; i++) {
        const isFirstStrand = i % 2 === 0;
        const curve = isFirstStrand ? mainCurve1 : mainCurve2;
        const uParam = strandStartU + (Math.random() * (strandEndU - strandStartU));
        const point = curve.getPoint(uParam);
        strandParticlePositions[i * 3] = point.x;
        strandParticlePositions[i * 3 + 1] = point.y;
        strandParticlePositions[i * 3 + 2] = point.z;
        strandParticleSeeds[i] = Math.random() * Math.PI * 2;
        strandParticleHues[i] = isFirstStrand ? 0.60 : 0.61; // dunkelblau, kein Lila/Pink
        strandParticleParams.push({
            curve: curve,
            uParam: uParam,
            speed: 0.0003 + Math.random() * 0.0002
        });
    }
    strandParticleGeo.setAttribute('position', new THREE.BufferAttribute(strandParticlePositions, 3));
    strandParticleGeo.setAttribute('aSeed', new THREE.BufferAttribute(strandParticleSeeds, 1));
    strandParticleGeo.setAttribute('aHue', new THREE.BufferAttribute(strandParticleHues, 1));

    // Pulsierende, schimmernde Trail-Partikel statt statischer Punkte
    const strandParticleMat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, pixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, opacity: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: `
            attribute float aSeed;
            attribute float aHue;
            varying float vTwinkle;
            varying float vHue;
            uniform float time;
            uniform float pixelRatio;
            void main() {
                vHue = aHue;
                float twinkle = 0.5 + 0.5 * sin(time * 3.0 + aSeed);
                vTwinkle = twinkle;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float baseSize = ${isDark ? '6.0' : '5.0'};
                gl_PointSize = baseSize * (0.6 + 0.6 * twinkle) * pixelRatio * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vTwinkle;
            varying float vHue;
            uniform float opacity;
            ${HSL_HELPER}
            void main() {
                vec2 uv = gl_PointCoord - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float alpha = smoothstep(0.5, 0.0, dist) * (${isDark ? '0.22' : '0.16'}) * opacity;
                vec3 color = hsl2rgb(vec3(vHue, 0.9, 0.42 + 0.18 * vTwinkle));
                gl_FragColor = vec4(color, alpha);
            }
        `
    });

    const strandParticles = new THREE.Points(strandParticleGeo, strandParticleMat);
    scene.add(strandParticles);

    let scrollProgress = 0;
    let targetScrollProgress = 0;
    const scrollLerpFactor = 0.18;

    const handleScroll = () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        targetScrollProgress = window.scrollY / maxScroll;
    };
    window.addEventListener('scroll', handleScroll);

    function updateUI(progress: number) {
        // Canvas: unsichtbar unter 5%, dann fade-in bis 15%
        const canvasOpacity = progress < 0.05 ? 0 : Math.min(1, (progress - 0.05) / 0.10);
        containerElement.style.setProperty('--canvas-opacity', canvasOpacity.toString());

        if (landingPageRef.current) {
            if (progress > 0.02) {
                landingPageRef.current.style.opacity = Math.max(0, 1 - (progress - 0.02) * 10).toString();
                landingPageRef.current.style.pointerEvents = 'none';
            } else {
                landingPageRef.current.style.opacity = '1';
                landingPageRef.current.style.pointerEvents = 'auto';
            }
        }
        // Die Sequenz-Anzeige (früher: 6 einzelne .info-box-Elemente, per
        // Klasse hier umgeschaltet) läuft jetzt komplett in InfoCircuitNode.tsx
        // direkt über useScrollProgress — kein DOM-Zugriff mehr von hier aus nötig.
    }

    const clock = new THREE.Timer();
    let animationFrameId: number;

    const camOffset = new THREE.Vector3(0, 48, 40);
    const camLookOffset = new THREE.Vector3(0, 6, 0);
    let currentCamPos = new THREE.Vector3();
    let currentCamLookAt = new THREE.Vector3();
    const camDampFactor = 0.08;

    function animate() {
        animationFrameId = requestAnimationFrame(animate);

        clock.update();
        const elapsedTime = clock.getElapsed();

        scrollProgress = THREE.MathUtils.lerp(scrollProgress, targetScrollProgress, scrollLerpFactor);
        updateUI(scrollProgress);
        updateBackgroundOpacity(scrollProgress);
        updateStrandOpacity(scrollProgress);

        mat1.uniforms.time.value = elapsedTime;
        mat2.uniforms.time.value = elapsedTime;
        bridgeMeshes.forEach(mesh => (mesh.material as THREE.ShaderMaterial).uniforms.time.value = elapsedTime);
        (strandParticleMat.uniforms.time.value as number) = elapsedTime;

        const posArr = ambientParticles.geometry.attributes.position.array;
        for (let i = 0; i < posArr.length; i += 3) {
            posArr[i + 1] += 0.05;
            if (posArr[i + 1] > 150) {
                posArr[i + 1] = -120;
                posArr[i] = (Math.random() - 0.5) * 450;
                posArr[i + 2] = (Math.random() - 0.5) * 1200;
            }
        }
        ambientParticles.geometry.attributes.position.needsUpdate = true;

        const lookAheadOffset = 0.08;
        const basePos = flightCurve.getPoint(scrollProgress);
        const aheadPos = flightCurve.getPoint(Math.min(scrollProgress + lookAheadOffset, 1.0));

        const targetCamPos = basePos.clone().add(camOffset);
        const targetCamLookAt = aheadPos.clone().add(camLookOffset);

        currentCamPos.lerp(targetCamPos, camDampFactor);
        currentCamLookAt.lerp(targetCamLookAt, camDampFactor);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentCamLookAt);

        assemblyPieces.forEach(mesh => {
            const pieceIdx = (mesh.userData as { pieceIndex: number; scatterOffset: THREE.Vector3 }).pieceIndex;
            const scatter = (mesh.userData as { pieceIndex: number; scatterOffset: THREE.Vector3 }).scatterOffset;

            const prebuiltOffset = -0.18;
            const triggerPoint = (pieceIdx / numPieces) * 0.75 + prebuiltOffset;
            const assemblyWindow = 0.10;

            let localFactor = (scrollProgress - triggerPoint) / assemblyWindow;
            localFactor = Math.max(0, Math.min(1, localFactor));
            localFactor = localFactor * localFactor * (3 - 2 * localFactor);

            mesh.position.x = scatter.x * (1.0 - localFactor);
            mesh.position.y = scatter.y * (1.0 - localFactor);
            mesh.position.z = scatter.z * (1.0 - localFactor);
        });

        const strandPosArr = strandParticles.geometry.attributes.position.array;
        for (let i = 0; i < strandParticleCount; i++) {
            const params = strandParticleParams[i];
            params.uParam += params.speed;
            if (params.uParam > strandEndU) params.uParam = strandStartU;

            const point = params.curve.getPoint(params.uParam);
            strandPosArr[i * 3] = point.x;
            strandPosArr[i * 3 + 1] = point.y;
            strandPosArr[i * 3 + 2] = point.z;
        }
        strandParticles.geometry.attributes.position.needsUpdate = true;

        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
    }

    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (composer) {
            composer.setSize(window.innerWidth, window.innerHeight);
        }
        updateBackgroundQuadSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        document.body.style.setProperty('--chat-flicker-opacity', '0');
        document.body.style.setProperty('--chat-flicker-image', 'none');

        // Vollständiges Aufräumen: ohne dies leakt jeder Theme-Toggle
        // GPU-Speicher, weil die Szene komplett neu aufgebaut wird.
        scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
                obj.geometry?.dispose();
                const material = obj.material;
                if (Array.isArray(material)) {
                    material.forEach((m) => m.dispose());
                } else {
                    material?.dispose();
                }
            }
        });
        composer?.dispose();
        renderer.dispose();
        bgSeq2Texture.dispose();
        bgSeqMidTexture.dispose();
        bgSeq5Texture.dispose();

        if (containerElement && renderer.domElement && containerElement.contains(renderer.domElement)) {
            containerElement.removeChild(renderer.domElement);
        }
    };
}
