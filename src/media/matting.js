'use strict';
// Refinamento do recorte do !sfundo, sem dependências e em tempo linear.
//
// A máscara do modelo de segmentação sai em baixa resolução e com bordas
// "sujas": restos do fundo grudados no cabelo, manchas soltas e pequenos
// furos. As etapas pesadas (filtro guiado, faixa incerta, limpeza e cor
// do fundo) rodam numa cópia reduzida (lado maior ≈ 720 px) e voltam para
// a resolução original por amostragem bilinear, então o custo não cresce
// com o tamanho da foto além de uma passada linear.

const WORK_SIDE = 720;
const GUIDED_RADIUS = 0.006; // fração do maior lado
const BAND_RADIUS = 0.012; // fração do maior lado
const GUIDED_EPS = 1e-4;
const GUIDED_WEIGHT = 0.75;
const UNCERTAIN_LOW = 0.02;
const UNCERTAIN_HIGH = 0.98;
const BBOX_ALPHA = 0.06;
const SUBJECT_ALPHA = 0.5;

const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
const curve = value => clamp01((value - 0.05) / 0.9);

// Média em janela quadrada (2r+1)² com bordas recortadas: duas passadas de
// somas acumuladas, O(n) para qualquer raio.
function boxMean(src, width, height, radius, out, tmp, line) {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    line[0] = 0;
    for (let x = 0; x < width; x++) line[x + 1] = line[x] + src[row + x];
    for (let x = 0; x < width; x++) {
      const lo = x - radius < 0 ? 0 : x - radius;
      const hi = x + radius + 1 > width ? width : x + radius + 1;
      tmp[row + x] = (line[hi] - line[lo]) / (hi - lo);
    }
  }
  for (let x = 0; x < width; x++) {
    line[0] = 0;
    for (let y = 0; y < height; y++) line[y + 1] = line[y] + tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = y - radius < 0 ? 0 : y - radius;
      const hi = y + radius + 1 > height ? height : y + radius + 1;
      out[y * width + x] = (line[hi] - line[lo]) / (hi - lo);
    }
  }
  return out;
}

function boxTools(width, height) {
  const tmp = new Float32Array(width * height);
  const line = new Float64Array(Math.max(width, height) + 1);
  return (src, radius, out = new Float32Array(width * height)) => boxMean(src, width, height, radius, out, tmp, line);
}

// Filtro guiado colorido (He, Sun & Tang): ajusta a máscara p às bordas
// da imagem-guia I resolvendo, por janela, um modelo linear q = aᵀI + b.
function guidedFilter(red, green, blue, p, width, height, radius, eps) {
  const n = width * height, boxer = boxTools(width, height), box = src => boxer(src, radius);
  const product = (a, b) => { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = a[i] * b[i]; return out; };
  const mr = box(red), mg = box(green), mb = box(blue), mp = box(p);
  const rr = box(product(red, red)), rg = box(product(red, green)), rb = box(product(red, blue));
  const gg = box(product(green, green)), gb = box(product(green, blue)), bb = box(product(blue, blue));
  const rp = box(product(red, p)), gp = box(product(green, p)), bp = box(product(blue, p));
  const ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cr = rp[i] - mr[i] * mp[i], cg = gp[i] - mg[i] * mp[i], cb = bp[i] - mb[i] * mp[i];
    const s11 = rr[i] - mr[i] * mr[i] + eps, s12 = rg[i] - mr[i] * mg[i], s13 = rb[i] - mr[i] * mb[i];
    const s22 = gg[i] - mg[i] * mg[i] + eps, s23 = gb[i] - mg[i] * mb[i], s33 = bb[i] - mb[i] * mb[i] + eps;
    // Inversa da matriz simétrica 3×3 pela adjunta.
    const i11 = s22 * s33 - s23 * s23, i12 = s13 * s23 - s12 * s33, i13 = s12 * s23 - s13 * s22;
    const i22 = s11 * s33 - s13 * s13, i23 = s12 * s13 - s11 * s23, i33 = s11 * s22 - s12 * s12;
    const det = s11 * i11 + s12 * i12 + s13 * i13;
    if (Math.abs(det) < 1e-18) { b[i] = mp[i]; continue; }
    const xr = (i11 * cr + i12 * cg + i13 * cb) / det;
    const xg = (i12 * cr + i22 * cg + i23 * cb) / det;
    const xb = (i13 * cr + i23 * cg + i33 * cb) / det;
    ar[i] = xr; ag[i] = xg; ab[i] = xb;
    b[i] = mp[i] - xr * mr[i] - xg * mg[i] - xb * mb[i];
  }
  const mar = box(ar), mag = box(ag), mab = box(ab), mbb = box(b), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = clamp01(mar[i] * red[i] + mag[i] * green[i] + mab[i] * blue[i] + mbb[i]);
  return q;
}

// Soma em janela por imagem integral; usada para vizinhanças binárias.
function windowCounts(mask, width, height, radius) {
  const stride = width + 1, integral = new Int32Array(stride * (height + 1)), out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      run += mask[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + run;
    }
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// Rotula componentes conexos de `mask` (8 ou 4 vizinhos) com uma fila
// tipada; devolve rótulos, tamanhos e se cada componente toca a borda.
function components(mask, width, height, diagonal) {
  const n = width * height, labels = new Int32Array(n).fill(-1), queue = new Int32Array(n);
  const sizes = [], border = [];
  const steps = diagonal ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let start = 0; start < n; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let head = 0, tail = 0, size = 0, touches = false;
    labels[start] = label; queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = (index - x) / width;
      size++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touches = true;
      for (const [dx, dy] of steps) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && labels[next] === -1) { labels[next] = label; queue[tail++] = next; }
      }
    }
    sizes.push(size); border.push(touches);
  }
  return { labels, sizes, border };
}

// Pixels alcançáveis a partir de `seeds` andando (8 vizinhos) por pixels
// com alpha acima de `threshold`; a franja imediatamente vizinha também conta.
function reach(seeds, alpha, width, height, threshold) {
  const n = width * height, seen = new Uint8Array(n), queue = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++) if (seeds[i]) { seen[i] = 1; queue[tail++] = i; }
  for (let head = 0; head < tail; head++) {
    const index = queue[head], x = index % width, y = (index - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const next = ny * width + nx;
        if (seen[next] || alpha[next] <= 0) continue;
        // A franja mais tênue (≤ threshold) é mantida, mas não propaga a busca.
        seen[next] = 1;
        if (alpha[next] > threshold) queue[tail++] = next;
      }
    }
  }
  return seen;
}

// Reduz por média de área: cada pixel de origem cai em exatamente um destino.
function downsample(data, width, height, smallWidth, smallHeight) {
  const n = smallWidth * smallHeight;
  const red = new Float32Array(n), green = new Float32Array(n), blue = new Float32Array(n), alpha = new Float32Array(n), count = new Float32Array(n);
  const columns = new Int32Array(width);
  for (let x = 0; x < width; x++) columns[x] = Math.min(smallWidth - 1, Math.floor(x * smallWidth / width));
  for (let y = 0; y < height; y++) {
    const row = Math.min(smallHeight - 1, Math.floor(y * smallHeight / height)) * smallWidth;
    for (let x = 0; x < width; x++) {
      const target = row + columns[x], source = (y * width + x) * 4;
      red[target] += data[source]; green[target] += data[source + 1]; blue[target] += data[source + 2]; alpha[target] += data[source + 3];
      count[target]++;
    }
  }
  for (let i = 0; i < n; i++) {
    const scale = 1 / (255 * (count[i] || 1));
    red[i] *= scale; green[i] *= scale; blue[i] *= scale; alpha[i] *= scale;
  }
  return { red, green, blue, alpha };
}

// Índices e pesos bilineares por linha/coluna, para voltar à resolução original.
function axis(size, smallSize) {
  const low = new Int32Array(size), high = new Int32Array(size), weight = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let position = (i + 0.5) * smallSize / size - 0.5;
    if (position < 0) position = 0;
    if (position > smallSize - 1) position = smallSize - 1;
    low[i] = Math.floor(position); high[i] = Math.min(smallSize - 1, low[i] + 1); weight[i] = position - low[i];
  }
  return { low, high, weight };
}

function measure(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1, solid = 0;
  const edge = BBOX_ALPHA * 255, subject = SUBJECT_ALPHA * 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > subject) solid++;
      if (alpha > edge) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  const total = width * height;
  return {
    bbox: right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 },
    coverage: total ? Math.round((solid / total) * 1e6) / 1e6 : 0,
  };
}

function refineCutout({ data, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length < width * height * 4)
    throw Object.assign(Error('Imagem de recorte inválida'), { code: 'BACKGROUND_INVALID_IMAGE' });
  const scale = Math.min(1, WORK_SIDE / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale)), sh = Math.max(1, Math.round(height * scale)), n = sw * sh;
  const longSide = Math.max(sw, sh);
  const { red, green, blue, alpha } = downsample(data, width, height, sw, sh);

  // 1. Faixa incerta: vizinhança que mistura assunto e fundo, ou alpha parcial.
  const bandRadius = Math.max(1, Math.round(longSide * BAND_RADIUS));
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = alpha[i] > SUBJECT_ALPHA ? 1 : 0;
  const mix = windowCounts(solid, sw, sh, bandRadius), band = new Float32Array(n);
  for (let i = 0; i < n; i++) band[i] = (mix[i] > 0 && mix[i] < 1) || (alpha[i] > UNCERTAIN_LOW && alpha[i] < UNCERTAIN_HIGH) ? 1 : 0;

  // 2. Filtro guiado apenas onde a faixa é incerta.
  const guided = guidedFilter(red, green, blue, alpha, sw, sh, Math.max(1, Math.round(longSide * GUIDED_RADIUS)), GUIDED_EPS);
  const refined = new Float32Array(n);
  for (let i = 0; i < n; i++) refined[i] = curve(band[i] ? GUIDED_WEIGHT * guided[i] + (1 - GUIDED_WEIGHT) * alpha[i] : alpha[i]);

  // 3. Ilhas soltas e pixels suaves longe do que foi mantido. "Solto" e
  // "longe" são medidos pela conectividade: um fio de cabelo semitransparente
  // que sai do assunto continua ligado a ele pelo próprio halo e é mantido,
  // por mais comprido que seja; manchas e névoa isoladas no fundo somem.
  for (let i = 0; i < n; i++) solid[i] = refined[i] > SUBJECT_ALPHA ? 1 : 0;
  const islands = components(solid, sw, sh, true);
  const largest = islands.sizes.reduce((max, size) => Math.max(max, size), 0);
  const minimum = Math.max(16, Math.min(0.02 * largest, 0.005 * n));
  const kept = new Uint8Array(n), clear = new Float32Array(n);
  for (let i = 0; i < n; i++) if (islands.labels[i] >= 0 && islands.sizes[islands.labels[i]] >= minimum) kept[i] = 1;
  const attached = reach(kept, refined, sw, sh, BBOX_ALPHA);
  let subjectArea = 0;
  for (let i = 0; i < n; i++) {
    if (refined[i] > 0 && !attached[i]) { clear[i] = 1; refined[i] = 0; }
    else if (refined[i] > SUBJECT_ALPHA) subjectArea++;
  }

  // 4. Furos internos pequenos (fundo 4-vizinho que não toca a borda).
  const background = new Uint8Array(n);
  for (let i = 0; i < n; i++) background[i] = refined[i] > SUBJECT_ALPHA ? 0 : 1;
  const holes = components(background, sw, sh, false), fill = new Float32Array(n);
  const holeLimit = 0.0015 * subjectArea;
  for (let i = 0; i < n; i++) {
    const label = holes.labels[i];
    if (label >= 0 && !holes.border[label] && holes.sizes[label] <= holeLimit) { fill[i] = 1; refined[i] = 1; }
  }

  // 5. Cor local do fundo: média ponderada por (1 − alpha) num raio 2× a faixa.
  const box = boxTools(sw, sh), weight = new Float32Array(n), wr = new Float32Array(n), wg = new Float32Array(n), wb = new Float32Array(n);
  for (let i = 0; i < n; i++) { const w = 1 - refined[i]; weight[i] = w; wr[i] = red[i] * w; wg[i] = green[i] * w; wb[i] = blue[i] * w; }
  const radius = bandRadius * 2, mw = box(weight, radius), mr = box(wr, radius), mg = box(wg, radius), mb = box(wb, radius);
  for (let i = 0; i < n; i++) {
    if (mw[i] > 1e-4) { mr[i] /= mw[i]; mg[i] /= mw[i]; mb[i] /= mw[i]; } else { mr[i] = red[i]; mg[i] = green[i]; mb[i] = blue[i]; }
  }

  // 6. Volta à resolução original com amostragem bilinear dos mapas.
  const out = Buffer.allocUnsafe(width * height * 4), cols = axis(width, sw), rows = axis(height, sh);
  const sample = (map, a, b, c, d, fx, fy) => (map[a] * (1 - fx) + map[b] * fx) * (1 - fy) + (map[c] * (1 - fx) + map[d] * fx) * fy;
  for (let y = 0; y < height; y++) {
    const r0 = rows.low[y] * sw, r1 = rows.high[y] * sw, fy = rows.weight[y];
    for (let x = 0; x < width; x++) {
      const c0 = cols.low[x], c1 = cols.high[x], fx = cols.weight[x];
      const a = r0 + c0, b = r0 + c1, c = r1 + c0, d = r1 + c1, index = (y * width + x) * 4;
      const original = data[index + 3] / 255;
      const inBand = sample(band, a, b, c, d, fx, fy);
      let value = original;
      if (inBand > 0) value = inBand * (GUIDED_WEIGHT * sample(guided, a, b, c, d, fx, fy) + (1 - GUIDED_WEIGHT) * original) + (1 - inBand) * original;
      value = curve(value);
      const removed = sample(clear, a, b, c, d, fx, fy), filled = sample(fill, a, b, c, d, fx, fy);
      if (removed > 0) value *= 1 - removed;
      if (filled > 0) value += (1 - value) * filled;
      const alpha255 = Math.round(value * 255);
      let r = data[index], g = data[index + 1], bl = data[index + 2];
      if (value > UNCERTAIN_LOW && value < UNCERTAIN_HIGH) {
        // Descontaminação: I = a·F + (1 − a)·B  ⇒  F = (I − (1 − a)·B) / a.
        const inverse = 1 - value, divisor = Math.max(value, 0.1);
        r = (r - inverse * 255 * sample(mr, a, b, c, d, fx, fy)) / divisor;
        g = (g - inverse * 255 * sample(mg, a, b, c, d, fx, fy)) / divisor;
        bl = (bl - inverse * 255 * sample(mb, a, b, c, d, fx, fy)) / divisor;
      }
      out[index] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
      out[index + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      out[index + 2] = bl < 0 ? 0 : bl > 255 ? 255 : Math.round(bl);
      out[index + 3] = alpha255;
    }
  }
  return { data: out, width, height, ...measure(out, width, height) };
}

// Transformada de distância euclidiana exata (Felzenszwalb–Huttenlocher):
// distância de cada pixel ao pixel verdadeiro mais próximo de `mask`.
function distanceTransform(mask, width, height) {
  const n = width * height, infinity = (width + height) * (width + height) + 1;
  const grid = new Float64Array(n), size = Math.max(width, height);
  const f = new Float64Array(size), d = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  for (let i = 0; i < n; i++) grid[i] = mask[i] ? 0 : infinity;
  const pass = length => {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    pass(height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    pass(width);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x];
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

// Contorno sólido com sombra suave atrás do assunto, como nas figurinhas
// recortadas à mão. A imagem precisa ter margem transparente ≥ raio.
function addOutline({ data, width, height }, { radius = 10, color = { r: 255, g: 255, b: 255 }, shadow = 0.22 } = {}) {
  const n = width * height, mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  const distance = distanceTransform(mask, width, height);
  const offset = Math.max(1, Math.round(radius * 0.25)), spread = Math.max(1, radius * 0.9);
  const out = Buffer.allocUnsafe(n * 4);
  for (let y = 0; y < height; y++) {
    const shifted = Math.max(0, y - offset) * width;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, index = i * 4;
      const ring = clamp01(radius + 0.5 - distance[i]);
      const fall = clamp01(1 - Math.max(0, distance[shifted + x] - radius) / spread);
      const shade = shadow * fall * fall;
      // Sombra (preta) → contorno → assunto, compostos com "over".
      let a = shade, r = 0, g = 0, b = 0;
      const over = (sr, sg, sb, sa) => {
        const total = sa + a * (1 - sa);
        if (total <= 0) { a = 0; return; }
        r = (sr * sa + r * a * (1 - sa)) / total; g = (sg * sa + g * a * (1 - sa)) / total; b = (sb * sa + b * a * (1 - sa)) / total; a = total;
      };
      if (ring > 0) over(color.r, color.g, color.b, ring);
      const sa = data[index + 3] / 255;
      if (sa > 0) over(data[index], data[index + 1], data[index + 2], sa);
      out[index] = Math.round(r); out[index + 1] = Math.round(g); out[index + 2] = Math.round(b); out[index + 3] = Math.round(a * 255);
    }
  }
  return { data: out, width, height };
}

module.exports = { refineCutout, addOutline, distanceTransform, measure, guidedFilter };
