import React, { useEffect, useRef } from 'react';

const COLORS = [
  '#007cf0', '#00dfd8', '#7928ca',
  '#ff0080', '#50e3c2', '#f9cb28',
];

function make(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.6 + 0.4,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: Math.random() * 0.22 + 0.04,
  };
}

export default function ParticleCanvas({ count = 50, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animId;
    let particles = [];

    function resize() {
      const p = canvas.parentElement;
      if (!p) return;
      canvas.width  = p.offsetWidth;
      canvas.height = p.offsetHeight;
    }

    function init() {
      resize();
      particles = Array.from({ length: count }, () => make(canvas.width, canvas.height));
    }

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -4) p.x = canvas.width  + 4;
        else if (p.x > canvas.width  + 4) p.x = -4;
        if (p.y < -4) p.y = canvas.height + 4;
        else if (p.y > canvas.height + 4) p.y = -4;
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(tick);
    }

    init();
    tick();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    />
  );
}
