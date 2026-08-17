// ATC BACKDROP — flowing simplex-noise colour field.
//
// A direct port of the index-page background shader from
// knight-l.github.io/sc-datav (its Index chunk): a plane whose fragment
// shader samples 3D simplex noise across UV + time, maps the result to a
// hue drifting around blue, and fades out on a soft disc. The GLSL below
// (random3 / simplex3d / hue2rgb / hsl2rgb / hash, and the body of main)
// is the original's, adapted from a 6x6 plane in a perspective scene to a
// full-viewport quad — so the aspect correction and the parallax offset
// are the only additions.
//
// Parallax there came from the camera lerping toward the pointer; here the
// same feel comes from offsetting the noise sample by the pointer, eased
// with the identical 1 - exp(-k * dt) smoothing the original uses.
//
// Renders at a fraction of device resolution (the field is soft enough that
// nobody can tell) and idles whenever the tab is hidden.
(function () {
  'use strict';

  const VERT = `
    attribute vec2 a_pos;
    varying vec2 vUv;
    void main() {
      vUv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FRAG = `
    precision highp float;
    varying vec2 vUv;

    uniform float u_time;
    uniform float u_aspect;
    uniform float u_speed;
    uniform float u_blur;
    uniform float u_scale;
    uniform vec2  u_parallax;
    uniform float u_light;    // 0 = dark theme, 1 = light theme

    float hue2rgb(float f1, float f2, float hue) {
      if (hue < 0.0) hue += 1.0;
      else if (hue > 1.0) hue -= 1.0;
      float res;
      if ((6.0 * hue) < 1.0) res = f1 + (f2 - f1) * 6.0 * hue;
      else if ((2.0 * hue) < 1.0) res = f2;
      else if ((3.0 * hue) < 2.0) res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
      else res = f1;
      return res;
    }

    vec3 hsl2rgb(vec3 hsl) {
      vec3 rgb;
      if (hsl.y == 0.0) {
        rgb = vec3(hsl.z);
      } else {
        float f2;
        if (hsl.z < 0.5) f2 = hsl.z * (1.0 + hsl.y);
        else f2 = hsl.z + hsl.y - hsl.y * hsl.z;
        float f1 = 2.0 * hsl.z - f2;
        rgb.r = hue2rgb(f1, f2, hsl.x + (1.0 / 3.0));
        rgb.g = hue2rgb(f1, f2, hsl.x);
        rgb.b = hue2rgb(f1, f2, hsl.x - (1.0 / 3.0));
      }
      return rgb;
    }

    vec3 random3(vec3 c) {
      float j = 4096.0 * sin(dot(c, vec3(17.0, 59.4, 15.0)));
      vec3 r;
      r.z = fract(512.0 * j);
      j *= 0.125;
      r.x = fract(512.0 * j);
      j *= 0.125;
      r.y = fract(512.0 * j);
      return r - 0.5;
    }

    const float F3 = 0.3333333;
    const float G3 = 0.1666667;

    float simplex3d(vec3 p) {
      vec3 s = floor(p + dot(p, vec3(F3)));
      vec3 x = p - s + dot(s, vec3(G3));

      vec3 e = step(vec3(0.0), x - x.yzx);
      vec3 i1 = e * (1.0 - e.zxy);
      vec3 i2 = 1.0 - e.zxy * (1.0 - e);

      vec3 x1 = x - i1 + G3;
      vec3 x2 = x - i2 + 2.0 * G3;
      vec3 x3 = x - 1.0 + 3.0 * G3;

      vec4 w, d;
      w.x = dot(x, x);
      w.y = dot(x1, x1);
      w.z = dot(x2, x2);
      w.w = dot(x3, x3);
      w = max(0.6 - w, 0.0);

      d.x = dot(random3(s), x);
      d.y = dot(random3(s + i1), x1);
      d.z = dot(random3(s + i2), x2);
      d.w = dot(random3(s + 1.0), x3);

      w *= w;
      w *= w;
      d *= w;
      return dot(d, vec4(52.0));
    }

    float hash(vec2 p) {
      return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x))));
    }

    void main() {
      // Aspect-corrected coords so the noise cells stay round on a wide
      // viewport (the original sampled a square plane, so it needed none).
      vec2 uv = vUv;
      uv.x = (uv.x - 0.5) * u_aspect + 0.5;

      vec2 center = uv - 0.5 + u_parallax;
      float dist = length(center);
      float alpha = smoothstep(u_blur, 0.0, dist);

      float n = simplex3d(vec3((uv + u_parallax) * u_scale, u_time * u_speed));

      // Same hue field either way, but the light theme needs MORE saturation,
      // not less. The first attempt desaturated to 0.34 and lifted lightness
      // to 0.86 — near-white and near-grey, which is exactly the flat haze it
      // produced. Holding saturation up and lightness only moderately high
      // keeps it reading as colour against white.
      float sat   = mix(0.50, 0.62, u_light);
      float light = mix(0.50, 0.72, u_light);
      vec3 color = hsl2rgb(vec3(0.6 + n * 0.2, sat, light));

      // Grain reads as dirt on a white page, so it all but disappears there.
      float val = hash(uv + u_time) * mix(1.0, 0.18, u_light);

      gl_FragColor = vec4(color + vec3(val / 20.0), alpha);
    }
  `;

  // Visual knobs. SPEED and the 0.6/0.2 hue window come from the original.
  const RENDER_SCALE = 0.5;   // fraction of CSS pixels actually rasterised
  const SPEED = 0.5;          // noise scroll rate, as in the reference
  const SCALE = 1.6;          // noise cells across the viewport
  const BLUR = 0.78;          // disc radius where the field fades to nothing
  const PARALLAX = 0.035;     // how far the field shifts with the pointer
  const EASE = 6;             // pointer follow rate, as 1 - exp(-EASE * dt)

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[atc-bg] shader failed:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function init() {
    if (document.querySelector('.atc-bg-canvas')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'atc-bg-canvas';
    // First child of <body> — it is position:fixed, so it stays out of the
    // body flex lane either way.
    document.body.insertBefore(canvas, document.body.firstChild);

    // premultipliedAlpha:false — the shader emits straight (non-premultiplied)
    // colour + alpha, which the browser would otherwise over-brighten when it
    // composites the canvas over the page.
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false })
            || canvas.getContext('experimental-webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) {
      // No WebGL: leave the CSS base gradient showing and bail quietly.
      console.warn('[atc-bg] no WebGL context — backdrop shader disabled.');
      canvas.remove();
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.remove(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[atc-bg] link failed:', gl.getProgramInfoLog(prog));
      canvas.remove();
      return;
    }
    gl.useProgram(prog);

    // One full-viewport quad.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      time:     gl.getUniformLocation(prog, 'u_time'),
      aspect:   gl.getUniformLocation(prog, 'u_aspect'),
      speed:    gl.getUniformLocation(prog, 'u_speed'),
      blur:     gl.getUniformLocation(prog, 'u_blur'),
      scale:    gl.getUniformLocation(prog, 'u_scale'),
      parallax: gl.getUniformLocation(prog, 'u_parallax'),
      light:    gl.getUniformLocation(prog, 'u_light')
    };
    gl.uniform1f(U.speed, SPEED);
    gl.uniform1f(U.blur, BLUR);
    gl.uniform1f(U.scale, SCALE);

    let w = 0, h = 0;
    function resize() {
      const cw = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
      const ch = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
      if (cw === w && ch === h) return;
      w = canvas.width = cw;
      h = canvas.height = ch;
      gl.viewport(0, 0, w, h);
      gl.uniform1f(U.aspect, window.innerWidth / Math.max(1, window.innerHeight));
    }
    resize();
    window.addEventListener('resize', resize);

    // Pointer parallax — target in -1..1, eased toward each frame.
    let tx = 0, ty = 0, px = 0, py = 0;
    window.addEventListener('pointermove', e => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = 0, last = performance.now(), raf = 0;
    // Theme mix, eased toward its target so a toggle crossfades the field
    // instead of cutting. atc-theme.js drives lightTarget.
    let light = 0, lightTarget = 0;

    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!still) {
        t += dt;
        const k = 1 - Math.exp(-EASE * dt);
        px += (tx * PARALLAX - px) * k;
        py += (ty * PARALLAX - py) * k;
      }
      if (light !== lightTarget) {
        const lk = 1 - Math.exp(-5 * dt);
        light += (lightTarget - light) * lk;
        if (Math.abs(lightTarget - light) < 0.002) light = lightTarget;
      }
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.light, light);
      gl.uniform2f(U.parallax, px, py);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Don't burn a GPU frame budget on a tab nobody is looking at.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });

    window._atcBg = {
      canvas, gl,
      setSpeed: v => gl.uniform1f(U.speed, v),
      // 0 = dark, 1 = light. Eased in the render loop; pass snap=true to jump
      // (used on first paint so the initial theme doesn't fade in).
      setLight: (v, snap) => {
        lightTarget = v ? 1 : 0;
        if (snap || still) light = lightTarget;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
