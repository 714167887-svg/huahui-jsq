// HUAHUI 淋浴房计算器 - 几何与款式偏移核心
// 算法来源：W/jsq/functions/_lib/protected-calc.js（沐新卫浴）
// 改动：
//   - 仅保留 HY-050 一个款式（开门、转轴）
//   - 偏移量按 HY-050 实测：stone_base = -13, sink_top = 32, stone_center = 14

// 各款型的截面偏移量（单位 mm）
// stone_base:   石材基座相对于立柱中心的内缩（负值 = 向墙内缩）
// sink_top:     型材顶部水槽沿到立柱中心的外凸距离
// stone_center: 石材中心线与立柱中心的偏移
// doorType:     门类型标识（hinged 开门 / sliding 移门）
// pivotType:    门轴类型（仅开门有效；pivot = 转轴）
export const MODEL_OFFSETS = {
  "HY-050": {
    stone_base: -13,
    sink_top: 32,
    stone_center: 14,
    doorType: "hinged",
    pivotType: "pivot",
  },
};

function normalizeNumericExpression(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 65248))
    .replace(/[＋﹢]/g, "+")
    .replace(/[－﹣—–]/g, "-")
    .replace(/[×＊xX]/g, "*")
    .replace(/[÷／]/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/．/g, ".")
    .replace(/[，,]/g, "");
}

function evaluateNumericExpression(value) {
  const expression = normalizeNumericExpression(value);
  let index = 0;

  if (!expression) return null;

  function skipWhitespace() {
    while (index < expression.length && /\s/.test(expression[index])) {
      index += 1;
    }
  }

  function parsePrimary() {
    skipWhitespace();
    if (index >= expression.length) return Number.NaN;

    const current = expression[index];
    if (current === "(") {
      index += 1;
      const nestedValue = parseAddSubtract();
      skipWhitespace();
      if (expression[index] !== ")") return Number.NaN;
      index += 1;
      return nestedValue;
    }

    const start = index;
    let hasDigit = false;
    let hasDot = false;
    while (index < expression.length) {
      const next = expression[index];
      if (next >= "0" && next <= "9") {
        hasDigit = true;
        index += 1;
        continue;
      }
      if (next === "." && !hasDot) {
        hasDot = true;
        index += 1;
        continue;
      }
      break;
    }

    if (!hasDigit) return Number.NaN;
    return Number.parseFloat(expression.slice(start, index));
  }

  function parseUnary() {
    skipWhitespace();
    let sign = 1;
    while (index < expression.length) {
      const current = expression[index];
      if (current === "+") {
        index += 1;
        skipWhitespace();
        continue;
      }
      if (current === "-") {
        sign *= -1;
        index += 1;
        skipWhitespace();
        continue;
      }
      break;
    }

    const result = parsePrimary();
    return Number.isNaN(result) ? result : result * sign;
  }

  function parseMultiplyDivide() {
    let result = parseUnary();
    if (Number.isNaN(result)) return result;

    while (true) {
      skipWhitespace();
      const operator = expression[index];
      if (operator !== "*" && operator !== "/") break;
      index += 1;
      const nextValue = parseUnary();
      if (Number.isNaN(nextValue)) return nextValue;
      result = operator === "*" ? result * nextValue : result / nextValue;
    }

    return result;
  }

  function parseAddSubtract() {
    let result = parseMultiplyDivide();
    if (Number.isNaN(result)) return result;

    while (true) {
      skipWhitespace();
      const operator = expression[index];
      if (operator !== "+" && operator !== "-") break;
      index += 1;
      const nextValue = parseMultiplyDivide();
      if (Number.isNaN(nextValue)) return nextValue;
      result = operator === "+" ? result + nextValue : result - nextValue;
    }

    return result;
  }

  const result = parseAddSubtract();
  skipWhitespace();
  if (index !== expression.length || !Number.isFinite(result)) return null;
  return result;
}

export function toNumber(value, fallback = 0) {
  const parsed = evaluateNumericExpression(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function distance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function resolveForcedBaseValue(forcedBaseDimensions, roomType, segment, fallbackValue) {
  const roomValues = forcedBaseDimensions && forcedBaseDimensions[roomType];
  const forcedValue = roomValues ? roomValues[segment] : null;
  return Number.isFinite(forcedValue) ? forcedValue : fallbackValue;
}

export function resolveForcedGuideValue(forcedGuideDimensions, roomType, segment, fallbackValue) {
  const roomValues = forcedGuideDimensions && forcedGuideDimensions[roomType];
  const forcedValue = roomValues ? roomValues[segment] : null;
  return Number.isFinite(forcedValue) ? forcedValue : fallbackValue;
}

export function calculateAngleFromSides(a, b, c) {
  const denominator = 2 * a * b;
  if (!(denominator > 0)) return 135;
  const cosVal = (a * a + b * b - c * c) / denominator;
  const clampedCos = Math.max(-1, Math.min(1, cosVal));
  return Math.acos(clampedCos) * 180 / Math.PI;
}

export function getLineIntersection(p1, p2, p3, p4, offset) {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  if (!len1) return null;
  const nx1 = -dy1 / len1;
  const ny1 = dx1 / len1;
  const op1 = { x: p1.x + nx1 * offset, y: p1.y + ny1 * offset };
  const op2 = { x: p2.x + nx1 * offset, y: p2.y + ny1 * offset };

  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  if (!len2) return null;
  const nx2 = -dy2 / len2;
  const ny2 = dx2 / len2;
  const op3 = { x: p3.x + nx2 * offset, y: p3.y + ny2 * offset };
  const op4 = { x: p4.x + nx2 * offset, y: p4.y + ny2 * offset };

  const denom = (op4.y - op3.y) * (op2.x - op1.x) - (op4.x - op3.x) * (op2.y - op1.y);
  if (!denom) return null;
  const ua = ((op4.x - op3.x) * (op1.y - op3.y) - (op4.y - op3.y) * (op1.x - op3.x)) / denom;
  return {
    x: op1.x + ua * (op2.x - op1.x),
    y: op1.y + ua * (op2.y - op1.y),
  };
}

export function getPerpStart(pStart, pEnd, offset, invert = false) {
  const dx = pEnd.x - pStart.x;
  const dy = pEnd.y - pStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { x: pStart.x, y: pStart.y };
  let nx = -dy / len;
  let ny = dx / len;
  if (invert) {
    nx = -nx;
    ny = -ny;
  }
  return { x: pStart.x + nx * offset, y: pStart.y + ny * offset };
}

export function getPerpEnd(pStart, pEnd, offset, invert = false) {
  const dx = pEnd.x - pStart.x;
  const dy = pEnd.y - pStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { x: pEnd.x, y: pEnd.y };
  let nx = -dy / len;
  let ny = dx / len;
  if (invert) {
    nx = -nx;
    ny = -ny;
  }
  return { x: pEnd.x + nx * offset, y: pEnd.y + ny * offset };
}

export function getShortenedPoint(startPoint, endPoint, shortenAmount) {
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { x: startPoint.x, y: startPoint.y };
  return {
    x: startPoint.x + dx / len * shortenAmount,
    y: startPoint.y + dy / len * shortenAmount,
  };
}

export function resolveModelOffset(payload = {}) {
  const installType = payload.installType || "stone_base";
  const rawModel = String(payload.modelValue || payload.modelInput || "").trim().replace(/\u6b3e/g, "");
  const stoneCenterWidth = toNumber(payload.stoneCenterWidth, 0);
  const sinkTopOutwardValue = toNumber(payload.sinkTopOutwardValue, 0);
  const stoneInwardValue = toNumber(payload.stoneInwardValue, 0);

  function buildOffsetResult(key, data) {
    if (installType === "stone_center") {
      const stoneCenterVar = data ? toNumber(data.stone_center, 0) : 0;
      return {
        offset: stoneCenterVar - stoneCenterWidth / 2,
        key,
        stoneCenterWidth,
        stoneCenterVar,
      };
    }

    if (installType === "stone_inward") {
      return {
        offset: -stoneInwardValue,
        key,
        stoneCenterWidth,
        stoneCenterVar: 0,
      };
    }

    if (installType === "room_body") {
      return {
        offset: -3,
        key,
        stoneCenterWidth,
        stoneCenterVar: 0,
      };
    }

    const baseOffset = data
      ? toNumber(data[installType], 0)
      : (installType === "sink_top" ? 32 : -13);
    return {
      offset: installType === "sink_top" ? baseOffset + sinkTopOutwardValue : baseOffset,
      key,
      stoneCenterWidth,
      stoneCenterVar: 0,
    };
  }

  if (!rawModel) {
    return buildOffsetResult("default", null);
  }

  if (Object.prototype.hasOwnProperty.call(MODEL_OFFSETS, rawModel)) {
    return buildOffsetResult(rawModel, MODEL_OFFSETS[rawModel]);
  }

  // 兼容前缀匹配（例如 "HY-050D" 之类的扩展款）
  for (const key of Object.keys(MODEL_OFFSETS)) {
    if (rawModel.startsWith(key)) {
      return buildOffsetResult(key, MODEL_OFFSETS[key]);
    }
  }

  return buildOffsetResult("default", null);
}

function calculateDiamondMetrics(payload, modelData) {
  const forcedBase = payload.forcedBaseDimensions || {};
  const forcedGuide = payload.forcedGuideDimensions || {};
  const mode = payload.currentMode || "angle";
  const shorten = toNumber(payload.shorten, 0);
  let rawL = 0;
  let rawC = 0;
  let rawR = 0;
  let aL = 135;
  let aR = 135;

  if (mode === "angle") {
    rawL = toNumber(payload.inputs && payload.inputs.l);
    rawC = toNumber(payload.inputs && payload.inputs.c);
    rawR = toNumber(payload.inputs && payload.inputs.r);
    aL = toNumber(payload.angles && payload.angles.l, 135);
    aR = toNumber(payload.angles && payload.angles.r, 135);
    if (!(aL > 90 && aL < 180)) aL = 135;
    if (!(aR > 90 && aR < 180)) aR = 135;
  } else if (mode === "cross") {
    rawL = toNumber(payload.inputs && payload.inputs.l2);
    rawC = toNumber(payload.inputs && payload.inputs.c2);
    rawR = toNumber(payload.inputs && payload.inputs.r2);
    const distLtoP2 = toNumber(payload.inputs && payload.inputs.distLtoP2);
    const distRtoP1 = toNumber(payload.inputs && payload.inputs.distRtoP1);
    aL = rawL > 0 && rawC > 0 && distLtoP2 > 0 ? calculateAngleFromSides(rawL, rawC, distLtoP2) : 135;
    aR = rawC > 0 && rawR > 0 && distRtoP1 > 0 ? calculateAngleFromSides(rawC, rawR, distRtoP1) : 135;
    if (!Number.isFinite(aL)) aL = 135;
    if (!Number.isFinite(aR)) aR = 135;
  } else if (mode === "pentagon") {
    rawL = toNumber(payload.inputs && payload.inputs.l);
    rawR = toNumber(payload.inputs && payload.inputs.r);
    const ls = toNumber(payload.inputs && payload.inputs.ls);
    const rs = toNumber(payload.inputs && payload.inputs.rs);
    rawC = Math.round(Math.sqrt(Math.pow(ls - rawR, 2) + Math.pow(rs - rawL, 2)));
    aL = 180 - Math.atan2(ls - rawR, rs - rawL) * 180 / Math.PI;
    aR = 180 - Math.atan2(rs - rawL, ls - rawR) * 180 / Math.PI;
    if (!Number.isFinite(aL)) aL = 135;
    if (!Number.isFinite(aR)) aR = 135;
  }

  const wallL = resolveForcedBaseValue(forcedBase, "diamond", "l", rawL);
  const wallC = rawC;
  const wallR = resolveForcedBaseValue(forcedBase, "diamond", "r", rawR);
  const displayBaseValues = {
    l: wallL,
    c: resolveForcedBaseValue(forcedBase, "diamond", "c", rawC),
    r: wallR,
    rawL,
    rawC,
    rawR,
  };
  const referencePoints = [
    { x: -rawL * Math.cos((180 - aL) * Math.PI / 180), y: -rawL * Math.sin((180 - aL) * Math.PI / 180) },
    { x: 0, y: 0 },
    { x: rawC, y: 0 },
    { x: rawC + rawR * Math.cos((180 - aR) * Math.PI / 180), y: -rawR * Math.sin((180 - aR) * Math.PI / 180) },
  ];
  const wallPoints = [
    { x: -wallL * Math.cos((180 - aL) * Math.PI / 180), y: -wallL * Math.sin((180 - aL) * Math.PI / 180) },
    { x: 0, y: 0 },
    { x: wallC, y: 0 },
    { x: wallC + wallR * Math.cos((180 - aR) * Math.PI / 180), y: -wallR * Math.sin((180 - aR) * Math.PI / 180) },
  ];

  if (!(wallL + wallC + wallR > 0)) {
    return {
      calculatedAngles: { l: aL, r: aR },
      geoLengths: { l: 0, c: 0, r: 0 },
      displayGuideValues: { l: 0, c: 0, r: 0 },
      displayBaseValues,
      wallPoints,
      referencePoints,
      hasData: false,
    };
  }

  const offset = modelData.offset;
  const newP1 = getLineIntersection(wallPoints[0], wallPoints[1], wallPoints[1], wallPoints[2], offset);
  const newP2 = getLineIntersection(wallPoints[1], wallPoints[2], wallPoints[2], wallPoints[3], offset);
  const newP0 = getPerpStart(wallPoints[0], wallPoints[1], offset);
  const newP3 = getPerpEnd(wallPoints[2], wallPoints[3], offset);

  if (!newP0 || !newP1 || !newP2 || !newP3) {
    return {
      calculatedAngles: { l: aL, r: aR },
      geoLengths: { l: 0, c: 0, r: 0 },
      displayGuideValues: { l: 0, c: 0, r: 0 },
      displayBaseValues,
      wallPoints,
      referencePoints,
      hasData: false,
    };
  }

  let rStart = getShortenedPoint(newP0, newP1, shorten);
  let rEnd = getShortenedPoint(newP3, newP2, shorten);
  const rawGuideLengths = {
    l: distance(rStart, newP1),
    c: distance(newP1, newP2),
    r: distance(newP2, rEnd),
  };
  const displayGuideValues = {
    l: resolveForcedGuideValue(forcedGuide, "diamond", "l", rawGuideLengths.l),
    c: resolveForcedGuideValue(forcedGuide, "diamond", "c", rawGuideLengths.c + (displayBaseValues.c - rawC)),
    r: resolveForcedGuideValue(forcedGuide, "diamond", "r", rawGuideLengths.r),
  };

  return {
    calculatedAngles: { l: aL, r: aR },
    geoLengths: displayGuideValues,
    actualGuideLengths: rawGuideLengths,
    displayGuideValues,
    displayBaseValues,
    wallPoints,
    referencePoints,
    hasData: true,
  };
}

export function calculateProtectedMetrics(payload = {}) {
  const modelData = resolveModelOffset(payload);
  // HUAHUI 当前打样阶段仅支持钻石型
  const metrics = calculateDiamondMetrics(payload, modelData);
  return { roomType: "diamond", modelData, ...metrics };
}
