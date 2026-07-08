import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

function Orb() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const wireRef = useRef<THREE.Mesh>(null!);
  const innerRef = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    meshRef.current.rotation.x += delta * 0.12;
    meshRef.current.rotation.y += delta * 0.18;
    wireRef.current.rotation.x += delta * 0.06;
    wireRef.current.rotation.y -= delta * 0.12;
    innerRef.current.rotation.x -= delta * 0.08;
    innerRef.current.rotation.z += delta * 0.1;
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.4, 2]} />
        <MeshDistortMaterial
          color="#6366f1"
          emissive="#4f46e5"
          emissiveIntensity={0.4}
          transparent
          opacity={0.65}
          roughness={0.1}
          metalness={0.95}
          distort={0.3}
          speed={4}
        />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshBasicMaterial
          color="#818cf8"
          wireframe
          transparent
          opacity={0.12}
        />
      </mesh>
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[1.0, 1]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.06}
          wireframe
        />
      </mesh>
    </group>
  );
}

function TorusKnot() {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ref.current.position.x = Math.sin(t * 0.4) * 2.8;
    ref.current.position.y = Math.cos(t * 0.6) * 2.8;
    ref.current.position.z = Math.sin(t * 0.3) * 1.5;
    ref.current.rotation.x += 0.01;
    ref.current.rotation.y += 0.02;
  });

  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[0.35, 0.1, 64, 8]} />
      <meshBasicMaterial
        color="#8b5cf6"
        transparent
        opacity={0.25}
        wireframe
      />
    </mesh>
  );
}

function Ring({ radius, color, opacity, speed, tiltX = Math.PI / 3 }: { radius: number; color: string; opacity: number; speed: number; tiltX?: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * speed * 0.3;
    ref.current.rotation.y += delta * speed * 0.2;
  });

  return (
    <mesh ref={ref} rotation={[tiltX, 0, 0]}>
      <torusGeometry args={[radius, 0.01, 32, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function Particles({ count = 2500 }) {
  const ref = useRef<THREE.Points>(null!);

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.015 + Math.random() * 0.05;
    }
    return [pos, sz];
  }, [count]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.015;
    ref.current.rotation.x += delta * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#818cf8"
        transparent
        opacity={0.5}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function FloatingShards() {
  const count = 30;
  const positions = useMemo(() => {
    const pos: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ]);
    }
    return pos;
  }, []);

  return (
    <group>
      {positions.map((pos, i) => (
        <Float key={i} speed={0.3 + Math.random() * 0.5} rotationIntensity={0.4} floatIntensity={0.2}>
          <mesh position={pos}>
            <octahedronGeometry args={[0.03 + Math.random() * 0.05, 0]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? '#6366f1' : i % 3 === 1 ? '#8b5cf6' : '#22d3ee'}
              transparent
              opacity={0.12 + Math.random() * 0.12}
              wireframe
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function SceneContent() {
  const { mouse } = useThree();
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    groupRef.current.position.x = mouse.x * 0.3;
    groupRef.current.position.y = mouse.y * -0.3;
    groupRef.current.rotation.z = mouse.x * 0.02;
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.0} rotationIntensity={0.1} floatIntensity={0.3}>
        <Orb />
      </Float>
      <TorusKnot />
      <Ring radius={2.6} color="#6366f1" opacity={0.08} speed={0.4} tiltX={Math.PI / 3} />
      <Ring radius={3.2} color="#22d3ee" opacity={0.05} speed={-0.3} tiltX={Math.PI / 4} />
      <Ring radius={2.0} color="#8b5cf6" opacity={0.07} speed={0.5} tiltX={Math.PI / 2.5} />
      <Ring radius={3.8} color="#818cf8" opacity={0.04} speed={-0.2} tiltX={Math.PI / 5} />
      <Particles count={2500} />
      <FloatingShards />
    </group>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -top-32 -bottom-32 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[3, 4, 5]} intensity={2.5} color="#6366f1" />
        <pointLight position={[-4, -2, 3]} intensity={1.2} color="#22d3ee" />
        <pointLight position={[0, -4, 4]} intensity={0.8} color="#8b5cf6" />
        <SceneContent />
      </Canvas>
    </div>
  );
}
