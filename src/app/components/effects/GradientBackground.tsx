"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

export default function GradientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <ShaderGradientCanvas
        className="absolute! inset-0 h-full w-full"
        style={{ width: "100%", height: "100%" }}
        pointerEvents="none"
        pixelDensity={1}
        fov={45}
        lazyLoad
      >
        <ShaderGradient
          control="props"
          type="waterPlane"
          animate="on"
          uTime={0}
          uSpeed={0.4}
          uStrength={4}
          uDensity={1.3}
          uFrequency={5.5}
          uAmplitude={1}
          range="disabled"
          rangeStart={0}
          rangeEnd={40}
          positionX={-1.4}
          positionY={0}
          positionZ={0}
          rotationX={0}
          rotationY={10}
          rotationZ={50}
          color1="#ff5005"
          color2="#dbba95"
          color3="#d0bce1"
          reflection={0.1}
          brightness={1.2}
          cAzimuthAngle={180}
          cPolarAngle={90}
          cDistance={3.6}
          cameraZoom={1}
          grain="on"
          lightType="3d"
          envPreset="city"
          shader="defaults"
          wireframe={false}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
