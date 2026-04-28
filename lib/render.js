import {
  calculateProtectedMetrics,
  distance,
  getLineIntersection,
  getPerpEnd,
  getPerpStart,
  getShortenedPoint,
  resolveForcedBaseValue,
  toNumber,
} from "./protected-calc.js";
import { getModelFeatureType } from "./model-catalog.js";

const PLACEHOLDER_TEXT = "\u8bf7\u8f93\u5165\u6570\u636e";
const BASE_SUFFIX_STONE = "\u77f3\u57fa";
const BASE_SUFFIX_SINK = "\u4e0b\u6c89\u533a";
const BASE_SUFFIX_ROOM = "\u623f\u4f53";
const GUIDE_SUFFIX = "\u5f13\u5c3a\u5bf8";
const AXIS_LABEL = "\u8f74";
const LEFT_SLIDE_LABEL = "\u5de6\u79fb";
const RIGHT_SLIDE_LABEL = "\u53f3\u79fb";
const SLIDE_LABEL_RISE_MM = 65;
const DIAMOND_SLIDE_LABEL_EXTRA_RISE_MM = 45;
const GUIDE_LABEL_GAP_REDUCTION_MM = 10;
const GUIDE_LABEL_MIN_GAP_MM = 2;
const ANGLE_LABEL_MIN_CLEARANCE_PX = 52;
const ANGLE_LABEL_RADIUS_STEPS_PX = [0, 6, 10];
const PENTAGON_ANGLE_LABEL_RADIUS_STEPS_PX = [0, 6, 10, 14, 18, 24];
const DIRECTION_LABEL_MIN_CLEARANCE_PX = 58;
const DIRECTION_LABEL_AVOIDANCE_STEPS = [
  { rise: 0, lateral: 0 },
  { rise: 10, lateral: 0 },
  { rise: 18, lateral: 12 },
  { rise: 26, lateral: 20 },
  { rise: 34, lateral: 28 },
];

function estimateTextCollisionRadius(text, charWidthPx, minRadius) {
  return Math.max(minRadius, String(text || "").length * charWidthPx);
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rnd(value) {
  return Math.round(value * 1000) / 1000;
}

function placeholderMarkup() {
  return '<text x="50%" y="50%" text-anchor="middle" fill="#9ca3af" font-size="16">' + PLACEHOLDER_TEXT + "</text>";
}

function transform(points, canvasW, canvasH, padding) {
  if (!points.length) return { scale: 1, tx: 0, ty: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (canvasW - padding * 2) / ((maxX - minX) || 1),
    (canvasH - padding * 2) / ((maxY - minY) || 1),
  );

  return {
    scale,
    tx: canvasW / 2 - ((minX + maxX) / 2) * scale,
    ty: canvasH / 2 - ((minY + maxY) / 2) * scale,
  };
}

function buildViewBox(points, roomType, mode) {
  if (!points.length) return "0 0 500 280";
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let padLeft = 60;
  let padRight = 60;
  let padTop = 60;
  let padBottom = 60;

  if (roomType === "diamond" && mode === "pentagon") {
    padLeft = 80;
    padRight = 80;
    padTop = 30;
    padBottom = 30;
  } else if (roomType === "diamond" && (mode === "angle" || mode === "cross")) {
    padLeft = 82;
    padRight = 52;
    padTop = 58;
    padBottom = 42;
  } else if (roomType === "diamond") {
    padLeft = 38;
    padRight = 38;
    padTop = 34;
    padBottom = 34;
  } else if (roomType === "lshape") {
    padLeft = 40;
    padRight = 40;
    padTop = 35;
    padBottom = 35;
  }

  return [
    rnd(minX - padLeft),
    rnd(minY - padTop),
    rnd(maxX - minX + padLeft + padRight),
    rnd(maxY - minY + padTop + padBottom),
  ].join(" ");
}

function angleArc(pVertex, p1, p2, angleDeg, opts = {}) {
  const v1 = { x: p1.x - pVertex.x, y: p1.y - pVertex.y };
  const v2 = { x: p2.x - pVertex.x, y: p2.y - pVertex.y };
  const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (!len1 || !len2) return { markup: "", point: null };

  const u1 = { x: v1.x / len1, y: v1.y / len1 };
  const u2 = { x: v2.x / len2, y: v2.y / len2 };
  const startAngle = Math.atan2(u1.y, u1.x);
  const endAngle = Math.atan2(u2.y, u2.x);
  let diff = endAngle - startAngle;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  while (diff > Math.PI) diff -= 2 * Math.PI;

  let radius = 24;
  if (angleDeg > 160) radius = 20;
  if (angleDeg === 90) radius = 30;
  if (Number.isFinite(opts.radiusOffset)) {
    radius += opts.radiusOffset;
  }

  const x1 = pVertex.x + u1.x * radius;
  const y1 = pVertex.y + u1.y * radius;
  const x2 = pVertex.x + u2.x * radius;
  const y2 = pVertex.y + u2.y * radius;
  const midAngle = startAngle + diff / 2;
  let textDistanceFactor = angleDeg === 90 ? 2.26 : (angleDeg > 160 ? 2.1 : 2.14);
  if (Number.isFinite(opts.textDistanceFactorOffset)) {
    textDistanceFactor += opts.textDistanceFactorOffset;
  }
  const tx = pVertex.x + Math.cos(midAngle) * radius * textDistanceFactor;
  const ty = pVertex.y + Math.sin(midAngle) * radius * textDistanceFactor;
  const textAttrs = opts.textAttrs || "";
  const textClass = opts.textClass || "svg-angle-text";
  const hideText = !!opts.hideText;
  const textValue = Number.isFinite(opts.displayValue) ? opts.displayValue : angleDeg;
  const collisionRadius = hideText
    ? 0
    : estimateTextCollisionRadius(Math.round(textValue) + "\u00b0", 6.6, 19);
  const textMarkup = hideText
    ? ""
    : '<text x="' + rnd(tx) + '" y="' + rnd(ty) + '" class="' + textClass + '"' + textAttrs + '>' + Math.round(textValue) + "\u00b0</text>";

  return {
    markup:
      '<path d="M ' + rnd(x1) + " " + rnd(y1) + " A " + radius + " " + radius + " 0 0 " + (diff > 0 ? 1 : 0) + " " + rnd(x2) + " " + rnd(y2) + '" class="svg-angle-arc" />' +
      textMarkup,
    point: hideText ? null : { x: tx, y: ty },
    collisionRadius,
    radiusOffset: Number.isFinite(opts.radiusOffset) ? opts.radiusOffset : 0,
  };
}

function extractLabelAnchors(labels) {
  return labels
    .map((label) => {
      if (!label) return null;
      if (label.point) {
        return {
          point: label.point,
          collisionRadius: Number.isFinite(label.collisionRadius) ? label.collisionRadius : 0,
        };
      }
      return {
        point: label,
        collisionRadius: 0,
      };
    })
    .filter((item) => item && item.point);
}

function getAnchorCollisionMargin(candidate, anchors, minClearancePx = ANGLE_LABEL_MIN_CLEARANCE_PX) {
  if (!candidate || !candidate.point || !anchors.length) {
    return Infinity;
  }

  return Math.min(...anchors.map((anchor) => {
    const requiredClearance = Math.max(
      minClearancePx,
      (candidate.collisionRadius || 0) + (anchor.collisionRadius || 0) - 4,
    );
    return distance(candidate.point, anchor.point) - requiredClearance;
  }));
}

function resolveAngleArcSeparation(pVertex, p1, p2, angleDeg, opts = {}, nearbyLabels = []) {
  const labelAnchors = extractLabelAnchors(nearbyLabels);
  let bestArc = angleArc(pVertex, p1, p2, angleDeg, opts);
  if (!bestArc.point || !labelAnchors.length) {
    return bestArc;
  }

  let bestMargin = getAnchorCollisionMargin(bestArc, labelAnchors);
  if (bestMargin >= 0) {
    return bestArc;
  }

  const radiusSteps = Array.isArray(opts.radiusSteps) && opts.radiusSteps.length
    ? opts.radiusSteps
    : ANGLE_LABEL_RADIUS_STEPS_PX;

  for (const radiusOffset of radiusSteps.slice(1)) {
    const candidate = angleArc(pVertex, p1, p2, angleDeg, {
      ...opts,
      radiusOffset,
      textDistanceFactorOffset: radiusOffset * 0.003,
    });
    if (!candidate.point) {
      continue;
    }

    const margin = getAnchorCollisionMargin(candidate, labelAnchors);
    if (margin > bestMargin) {
      bestArc = candidate;
      bestMargin = margin;
    }
    if (margin >= 0) {
      return candidate;
    }
  }

  return bestArc;
}

function angleForceAttrs(roomType, segment, displayValue, active) {
  return ' data-force-editable="true" data-force-scope="angle" data-force-type="' + roomType + '" data-force-segment="' + segment +
    '" data-force-value="' + rnd(displayValue) + '"' + (active ? ' data-force-active="true"' : "");
}

function resolveForcedAngleValue(forcedAngleDimensions, roomType, segment, fallbackValue) {
  const roomValues = forcedAngleDimensions && forcedAngleDimensions[roomType];
  const forcedValue = roomValues ? roomValues[segment] : null;
  return Number.isFinite(forcedValue) ? forcedValue : fallbackValue;
}

function helperTextMarkup(x, y, value) {
  return '<text x="' + rnd(x) + '" y="' + rnd(y) + '" style="font-size:20px;fill:#3b82f6;">' + esc(Math.round(value)) + "</text>";
}

function labelMarkup(pStart, pEnd, displayLen, suffix, isRed, opts) {
  const mid = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
  const dx = pEnd.x - pStart.x;
  const dy = pEnd.y - pStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { markup: "", point: null };
  const ux = dx / len;
  const uy = dy / len;
  const preserveNormal = !!opts.preserveNormal;

  let nx = -dy / len;
  let ny = dx / len;
  if (!preserveNormal && !isRed) {
    const isUpper = mid.y < (opts.midlineY || 140);
    if ((isUpper && ny > 0) || (!isUpper && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }
  } else if (!preserveNormal && ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  if (opts.flipNormal) {
    nx = -nx;
    ny = -ny;
  }

  let redOffsetPx = 0;
  if (isRed) {
    const defaultRedOffsetPx = opts.guideTextOffsetPx * opts.redFactor;
    const scalePx = Number.isFinite(opts.scalePx) ? opts.scalePx : 1;
    const reducedGapPx = Math.max(
      Math.abs(defaultRedOffsetPx) - GUIDE_LABEL_GAP_REDUCTION_MM * scalePx,
      GUIDE_LABEL_MIN_GAP_MM * scalePx,
    );
    redOffsetPx = reducedGapPx * (defaultRedOffsetPx < 0 ? -1 : 1);
  }

  let tx = mid.x + nx * (isRed ? redOffsetPx : opts.textDir * opts.textOffsetPx * opts.baseFactor);
  let ty = mid.y + ny * (isRed ? redOffsetPx : opts.textDir * opts.textOffsetPx * opts.baseFactor);

  if (opts.avoid && displayLen > 0 && displayLen < 380) {
    const shortFactor = Math.min(1, (380 - displayLen) / 180);
    const shiftSign = opts.avoid === "start" ? 1 : -1;
    tx += ux * Math.min(len * (0.1 + shortFactor * 0.22), 58) * shiftSign + nx * (isRed ? opts.guideTextOffsetPx : opts.textOffsetPx) * (0.18 + shortFactor * 0.28);
    ty += uy * Math.min(len * (0.1 + shortFactor * 0.22), 58) * shiftSign + ny * (isRed ? opts.guideTextOffsetPx : opts.textOffsetPx) * (0.18 + shortFactor * 0.28);
  }

  if (opts.alongShiftPx) {
    tx += ux * opts.alongShiftPx;
    ty += uy * opts.alongShiftPx;
  }
  if (opts.normalShiftPx) {
    tx += nx * opts.normalShiftPx;
    ty += ny * opts.normalShiftPx;
  }

  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;

  let attrs = "";
  if (opts.linkMeta && opts.linkMeta.roomType && opts.linkMeta.segment) {
    attrs +=
      ' data-anomaly-room-type="' + opts.linkMeta.roomType + '"' +
      ' data-anomaly-segment="' + opts.linkMeta.segment + '"';
  }
  if (!isRed && opts.forceMeta) {
    attrs +=
      ' data-force-editable="true" data-force-scope="base" data-force-type="' + opts.forceMeta.roomType +
      '" data-force-segment="' + opts.forceMeta.segment + '" data-force-value="' + rnd(displayLen) + '"' +
      (opts.forceMeta.active ? ' data-force-active="true"' : "");
  }

  return {
    markup:
      '<text x="' + rnd(tx) + '" y="' + rnd(ty) + '" class="' + (isRed ? "svg-guide-text" : "svg-text") + '"' + attrs +
      ' transform="rotate(' + rnd(angle) + ", " + rnd(tx) + ", " + rnd(ty) + ')">' + esc(Math.round(displayLen) + " " + suffix) + "</text>",
    point: { x: tx, y: ty },
    collisionRadius: estimateTextCollisionRadius(Math.round(displayLen) + " " + suffix, 6.2, 30) + (isRed && opts.avoid ? 42 : 0),
  };
}

function applyGuideLabelSeparation(baseLabel, guideLabel, pStart, pEnd, displayLen, suffix, opts) {
  if (!baseLabel || !baseLabel.point || !guideLabel || !guideLabel.point) {
    return guideLabel;
  }

  if (distance(baseLabel.point, guideLabel.point) >= 44) {
    return guideLabel;
  }

  const normalSign = opts.guideTextOffsetPx >= 0 ? 1 : -1;
  let bestLabel = guideLabel;

  for (const step of [
    { normal: 8 },
    { normal: 12 },
    { normal: 16 },
    { normal: 20 },
    { normal: 24 },
  ]) {
    const candidate = labelMarkup(pStart, pEnd, displayLen, suffix, true, {
      ...opts,
      normalShiftPx: normalSign * step.normal,
    });
    bestLabel = candidate;
    if (candidate.point && distance(baseLabel.point, candidate.point) >= 44) {
      return candidate;
    }
  }

  return bestLabel;
}

function resolveDirectionLabelPosition(basePos, labelText, nearbyLabels, isLeft) {
  const labelAnchors = extractLabelAnchors(nearbyLabels);
  if (!labelAnchors.length) {
    return basePos;
  }

  const baseCandidate = {
    point: basePos,
    collisionRadius: estimateTextCollisionRadius(labelText, 14, 34),
  };
  let bestPos = basePos;
  let bestMargin = getAnchorCollisionMargin(baseCandidate, labelAnchors, DIRECTION_LABEL_MIN_CLEARANCE_PX);
  if (bestMargin >= 0) {
    return bestPos;
  }

  const lateralDir = isLeft ? -1 : 1;
  for (const step of DIRECTION_LABEL_AVOIDANCE_STEPS.slice(1)) {
    const candidatePos = {
      x: basePos.x + lateralDir * step.lateral,
      y: basePos.y - step.rise,
    };
    const margin = getAnchorCollisionMargin({
      point: candidatePos,
      collisionRadius: baseCandidate.collisionRadius,
    }, labelAnchors, DIRECTION_LABEL_MIN_CLEARANCE_PX);
    if (margin > bestMargin) {
      bestPos = candidatePos;
      bestMargin = margin;
    }
    if (margin >= 0) {
      return candidatePos;
    }
  }

  return bestPos;
}

function renderDiamondDirection(payload, feature, tPts, scale, nearbyLabels = []) {
  if (!payload.currentDirection || payload.currentDirection === "none") return { markup: "", point: null };
  const isLeft = payload.currentDirection === "left";
  const labelText = feature === "hinged" ? AXIS_LABEL : (isLeft ? LEFT_SLIDE_LABEL : RIGHT_SLIDE_LABEL);
  const corner = isLeft ? tPts[1] : tPts[2];
  const basePos = {
    x: corner.x + (feature === "hinged" ? 0 : (isLeft ? 90 * scale : -90 * scale)),
    y: corner.y + (feature === "hinged" ? 60 * scale : (-190 - SLIDE_LABEL_RISE_MM - DIAMOND_SLIDE_LABEL_EXTRA_RISE_MM) * scale),
  };
  const pos = feature === "hinged" || payload.currentMode !== "pentagon"
    ? basePos
    : resolveDirectionLabelPosition(basePos, labelText, nearbyLabels, isLeft);
  const styleText = feature === "hinged"
    ? "font-size:24px;fill:#b91c1c;font-weight:normal;font-family:Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;"
    : "font-size:26px;fill:#b91c1c;font-weight:normal;font-family:Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;";

  return {
    markup:
      '<text id="direction-label" class="svg-direction-label" data-base-x="' + rnd(pos.x) + '" data-base-y="' + rnd(pos.y) +
      '" x="' + rnd(pos.x) + '" y="' + rnd(pos.y) + '" style="' + esc(styleText) + '">' + esc(labelText) + "</text>",
    point: pos,
  };
}

function renderLshapeDirection(payload, feature, tPts, scale) {
  if (!payload.currentDirection || payload.currentDirection === "none") return { markup: "", point: null };

  const frontLeft = tPts[1].x <= tPts[2].x ? tPts[1] : tPts[2];
  const frontRight = tPts[1].x <= tPts[2].x ? tPts[2] : tPts[1];
  const frontDx = frontRight.x - frontLeft.x;
  const frontDy = frontRight.y - frontLeft.y;
  const frontLen = Math.sqrt(frontDx * frontDx + frontDy * frontDy) || 1;
  const frontUx = frontDx / frontLen;
  const frontUy = frontDy / frontLen;
  const isLeft = payload.currentDirection === "left";

  if (feature === "hinged") {
    const axisInset = Math.min(frontLen * 0.08, 18);
    const pos = isLeft
      ? { x: frontLeft.x + frontUx * axisInset - 30 * scale, y: frontLeft.y + frontUy * axisInset + 26 }
      : { x: frontRight.x - frontUx * axisInset - 30 * scale, y: frontRight.y - frontUy * axisInset + 26 };
    return {
      markup:
        '<text id="direction-label" class="svg-direction-label" data-base-x="' + rnd(pos.x) + '" data-base-y="' + rnd(pos.y) +
        '" x="' + rnd(pos.x) + '" y="' + rnd(pos.y) +
        '" style="font-size:24px;fill:#b91c1c;font-weight:normal;font-family:Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;">' +
        esc(AXIS_LABEL) + "</text>",
      point: pos,
    };
  }

  const slideInset = Math.min(frontLen * 0.28, 75);
  const pos = isLeft
    ? { x: frontLeft.x + frontUx * slideInset, y: frontLeft.y + frontUy * slideInset - 92 - SLIDE_LABEL_RISE_MM * scale }
    : { x: frontRight.x - frontUx * slideInset, y: frontRight.y - frontUy * slideInset - 92 - SLIDE_LABEL_RISE_MM * scale };

  return {
    markup:
      '<text id="direction-label" class="svg-direction-label" data-base-x="' + rnd(pos.x) + '" data-base-y="' + rnd(pos.y) +
      '" x="' + rnd(pos.x) + '" y="' + rnd(pos.y) +
      '" style="font-size:26px;fill:#b91c1c;font-weight:normal;font-family:Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;">' +
      esc(isLeft ? LEFT_SLIDE_LABEL : RIGHT_SLIDE_LABEL) + "</text>",
    point: pos,
  };
}

function renderDiamond(payload, metrics) {
  const mode = payload.currentMode || "angle";
  const installType = payload.installType || "stone_base";
  const isSinkTop = installType === "sink_top";
  const hasModelInput = !!String(payload.modelValue || payload.modelInput || "").trim().replace(/\u6b3e/g, "");
  const boxHeight = mode === "pentagon" ? 390 : 280;
  const suffixText = isSinkTop ? BASE_SUFFIX_SINK : (installType === "room_body" ? BASE_SUFFIX_ROOM : BASE_SUFFIX_STONE);

  const pts = Array.isArray(metrics.wallPoints) && metrics.wallPoints.length === 4 ? metrics.wallPoints : null;
  const helperPts = Array.isArray(metrics.referencePoints) && metrics.referencePoints.length === 4
    ? metrics.referencePoints
    : pts;

  if (!pts || !(metrics.displayBaseValues && (metrics.displayBaseValues.l + metrics.displayBaseValues.c + metrics.displayBaseValues.r > 0))) {
    return { svgMarkup: placeholderMarkup(), viewBox: "0 0 500 280", boxHeight };
  }

  const aL = metrics.calculatedAngles.l;
  const aR = metrics.calculatedAngles.r;
  const fitPoints = mode === "cross" || mode === "pentagon" ? pts.concat(helperPts || []) : pts;
  const tf = transform(fitPoints, 500, boxHeight, mode === "pentagon" ? 10 : 0);
  const t = (point) => ({ x: point.x * tf.scale + tf.tx, y: point.y * tf.scale + tf.ty });
  const tPts = pts.map(t);
  const tHelperPts = (helperPts || pts).map(t);
  const scale = tf.scale;
  const textOffsetPx = 50 * scale;
  const guideTextOffsetPx = (isSinkTop ? 6 : -6) * scale;
  const offPts = [
    getPerpStart(pts[0], pts[1], metrics.modelData.offset),
    getLineIntersection(pts[0], pts[1], pts[1], pts[2], metrics.modelData.offset),
    getLineIntersection(pts[1], pts[2], pts[2], pts[3], metrics.modelData.offset),
    getPerpEnd(pts[2], pts[3], metrics.modelData.offset),
  ];

  if (offPts.some((point) => !point)) {
    return { svgMarkup: placeholderMarkup(), viewBox: "0 0 500 280", boxHeight };
  }

  const tOff = offPts.map(t);
  const rStart = getShortenedPoint(tOff[0], tOff[1], toNumber(payload.shorten, 0) * scale);
  const rEnd = getShortenedPoint(tOff[3], tOff[2], toNumber(payload.shorten, 0) * scale);

  const feature = getModelFeatureType(payload.modelValue || payload.modelInput || "");
  const baseLeft = metrics.displayBaseValues.l;
  const baseCenter = metrics.displayBaseValues.c;
  const baseRight = metrics.displayBaseValues.r;
  const guideValues = metrics.displayGuideValues || metrics.geoLengths || { l: 0, c: 0, r: 0 };
  const forcedAngles = payload.forcedAngleDimensions && payload.forcedAngleDimensions.diamond;
  const angleLeftDisplay = resolveForcedAngleValue(payload.forcedAngleDimensions, "diamond", "angle-l", aL);
  const angleRightDisplay = resolveForcedAngleValue(payload.forcedAngleDimensions, "diamond", "angle-r", aR);
  const angleRadiusSteps = mode === "pentagon" ? PENTAGON_ANGLE_LABEL_RADIUS_STEPS_PX : ANGLE_LABEL_RADIUS_STEPS_PX;
  const points = (mode === "cross" || mode === "pentagon" ? tPts.concat(tHelperPts) : tPts.slice()).concat(tOff, [rStart, rEnd]);
  const baseLabelMap = {};
  const guideLabelMap = {};
  let baseLabelsMarkup = "";
  let guideLabelsMarkup = "";
  let html =
    '<path d="M ' + rnd(tPts[0].x) + " " + rnd(tPts[0].y) + " L " + rnd(tPts[1].x) + " " + rnd(tPts[1].y) + " L " + rnd(tPts[2].x) + " " + rnd(tPts[2].y) + " L " + rnd(tPts[3].x) + " " + rnd(tPts[3].y) + '" class="svg-wall" />';

  if (mode === "cross") {
    const distLtoP2 = toNumber(payload.inputs && payload.inputs.distLtoP2);
    const distRtoP1 = toNumber(payload.inputs && payload.inputs.distRtoP1);
    if (distLtoP2 > 0) {
      const mid = { x: (tHelperPts[0].x + tHelperPts[2].x) / 2, y: (tHelperPts[0].y + tHelperPts[2].y) / 2 };
      html += '<line x1="' + rnd(tHelperPts[0].x) + '" y1="' + rnd(tHelperPts[0].y) + '" x2="' + rnd(tHelperPts[2].x) + '" y2="' + rnd(tHelperPts[2].y) + '" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />';
      html += helperTextMarkup(mid.x - 50, mid.y - 5, distLtoP2);
      points.push(mid, { x: mid.x - 50, y: mid.y - 5 });
    }
    if (distRtoP1 > 0) {
      const mid = { x: (tHelperPts[3].x + tHelperPts[1].x) / 2, y: (tHelperPts[3].y + tHelperPts[1].y) / 2 };
      html += '<line x1="' + rnd(tHelperPts[3].x) + '" y1="' + rnd(tHelperPts[3].y) + '" x2="' + rnd(tHelperPts[1].x) + '" y2="' + rnd(tHelperPts[1].y) + '" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />';
      html += helperTextMarkup(mid.x + 10, mid.y - 5, distRtoP1);
      points.push(mid, { x: mid.x + 10, y: mid.y - 5 });
    }
  } else if (mode === "pentagon") {
    const ls = toNumber(payload.inputs && payload.inputs.ls);
    const rs = toNumber(payload.inputs && payload.inputs.rs);
    if (ls > 0 && rs > 0) {
      const leftDx = helperPts[1].x - helperPts[0].x;
      const leftDy = helperPts[1].y - helperPts[0].y;
      const leftLen = Math.sqrt(leftDx * leftDx + leftDy * leftDy) || 1;
      const leftPerpX = -leftDy / leftLen;
      const leftPerpY = leftDx / leftLen;

      const rightDx = helperPts[2].x - helperPts[3].x;
      const rightDy = helperPts[2].y - helperPts[3].y;
      const rightLen = Math.sqrt(rightDx * rightDx + rightDy * rightDy) || 1;
      const rightPerpX = rightDy / rightLen;
      const rightPerpY = -rightDx / rightLen;

      const denom = leftPerpX * rightPerpY - leftPerpY * rightPerpX;
      if (Math.abs(denom) > 0.001) {
        const dx = helperPts[3].x - helperPts[0].x;
        const dy = helperPts[3].y - helperPts[0].y;
        const t1 = (dx * rightPerpY - dy * rightPerpX) / denom;
        const rawIntersect = { x: helperPts[0].x + t1 * leftPerpX, y: helperPts[0].y + t1 * leftPerpY };
        const tIntersect = t(rawIntersect);
        const leftMid = { x: (tHelperPts[0].x + tIntersect.x) / 2, y: (tHelperPts[0].y + tIntersect.y) / 2 };
        const rightMid = { x: (tHelperPts[3].x + tIntersect.x) / 2, y: (tHelperPts[3].y + tIntersect.y) / 2 };
        const leftArc = angleArc(tHelperPts[0], tHelperPts[1], tIntersect, 90, {
          hideText: true,
        });
        const rightArc = angleArc(tHelperPts[3], tIntersect, tHelperPts[2], 90, {
          hideText: true,
        });

        html += '<line x1="' + rnd(tHelperPts[0].x) + '" y1="' + rnd(tHelperPts[0].y) + '" x2="' + rnd(tIntersect.x) + '" y2="' + rnd(tIntersect.y) + '" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />';
        html += leftArc.markup;
        html += helperTextMarkup(leftMid.x - 30, leftMid.y, ls);

        html += '<line x1="' + rnd(tHelperPts[3].x) + '" y1="' + rnd(tHelperPts[3].y) + '" x2="' + rnd(tIntersect.x) + '" y2="' + rnd(tIntersect.y) + '" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3" />';
        html += rightArc.markup;
        html += helperTextMarkup(rightMid.x - 10, rightMid.y, rs);

        points.push(tIntersect, leftArc.point, rightArc.point, { x: leftMid.x - 30, y: leftMid.y }, { x: rightMid.x - 10, y: rightMid.y });
      }
    }
  }

  if (hasModelInput) {
    html +=
      '<path d="M ' + rnd(rStart.x) + " " + rnd(rStart.y) + " L " + rnd(tOff[1].x) + " " + rnd(tOff[1].y) + " L " + rnd(tOff[2].x) + " " + rnd(tOff[2].y) + " L " + rnd(rEnd.x) + " " + rnd(rEnd.y) + '" class="svg-guide" />';
  }

  [
    ["l", tPts[0], tPts[1], baseLeft, "end"],
    ["c", tPts[1], tPts[2], baseCenter, null],
    ["r", tPts[2], tPts[3], baseRight, "start"],
  ].forEach((item) => {
    const lab = labelMarkup(item[1], item[2], item[3], suffixText, false, {
      guideTextOffsetPx,
      textOffsetPx,
      textDir: isSinkTop ? -1 : 1,
      baseFactor: 1.12,
      redFactor: 1.15,
      avoid: item[4],
      preserveNormal: mode === "pentagon" && item[0] === "l",
      linkMeta: {
        roomType: "diamond",
        segment: item[0],
      },
      forceMeta: {
        roomType: "diamond",
        segment: item[0],
        active: Number.isFinite(payload.forcedBaseDimensions && payload.forcedBaseDimensions.diamond && payload.forcedBaseDimensions.diamond[item[0]]),
      },
      midlineY: boxHeight / 2,
    });
    baseLabelsMarkup += lab.markup;
    points.push(lab.point);
    baseLabelMap[item[0]] = lab;
  });

  if (hasModelInput) {
    [
      ["l", rStart, tOff[1], guideValues.l, "end"],
      ["c", tOff[1], tOff[2], guideValues.c, null],
      ["r", tOff[2], rEnd, guideValues.r, "start"],
    ].forEach((item) => {
      const guideOpts = {
        guideTextOffsetPx,
        textOffsetPx,
        scalePx: scale,
        textDir: 1,
        baseFactor: 1.12,
        redFactor: 1.02,
        avoid: item[4],
        linkMeta: {
          roomType: "diamond",
          segment: item[0],
        },
        midlineY: boxHeight / 2,
      };
      let lab = labelMarkup(item[1], item[2], item[3], GUIDE_SUFFIX, true, guideOpts);
      lab = applyGuideLabelSeparation(baseLabelMap[item[0]], lab, item[1], item[2], item[3], GUIDE_SUFFIX, guideOpts);
      guideLabelsMarkup += lab.markup;
      points.push(lab.point);
      guideLabelMap[item[0]] = lab;
    });
  }

  const arcLeftOpts = {
    displayValue: angleLeftDisplay,
    radiusSteps: angleRadiusSteps,
    scalePx: scale,
    textAttrs: angleForceAttrs("diamond", "angle-l", angleLeftDisplay, Number.isFinite(forcedAngles && forcedAngles["angle-l"])),
  };
  const arcRightOpts = {
    displayValue: angleRightDisplay,
    radiusSteps: angleRadiusSteps,
    scalePx: scale,
    textAttrs: angleForceAttrs("diamond", "angle-r", angleRightDisplay, Number.isFinite(forcedAngles && forcedAngles["angle-r"])),
  };
  let arc1 = resolveAngleArcSeparation(tPts[1], tPts[0], tPts[2], aL, arcLeftOpts, [
    baseLabelMap.l,
    guideLabelMap.l,
  ]);
  let arc2 = resolveAngleArcSeparation(tPts[2], tPts[1], tPts[3], aR, arcRightOpts, [
    baseLabelMap.r,
    guideLabelMap.r,
  ]);
  const sharedAngleRadiusOffset = Math.max(
    Number.isFinite(arc1.radiusOffset) ? arc1.radiusOffset : 0,
    Number.isFinite(arc2.radiusOffset) ? arc2.radiusOffset : 0,
  );
  if (sharedAngleRadiusOffset > 0) {
    if ((arc1.radiusOffset || 0) < sharedAngleRadiusOffset) {
      arc1 = angleArc(tPts[1], tPts[0], tPts[2], aL, {
        ...arcLeftOpts,
        radiusOffset: sharedAngleRadiusOffset,
        textDistanceFactorOffset: sharedAngleRadiusOffset * 0.003,
      });
    }
    if ((arc2.radiusOffset || 0) < sharedAngleRadiusOffset) {
      arc2 = angleArc(tPts[2], tPts[1], tPts[3], aR, {
        ...arcRightOpts,
        radiusOffset: sharedAngleRadiusOffset,
        textDistanceFactorOffset: sharedAngleRadiusOffset * 0.003,
      });
    }
  }
  html += arc1.markup + arc2.markup;
  html += baseLabelsMarkup + guideLabelsMarkup;
  points.push(arc1.point, arc2.point);

  const direction = renderDiamondDirection(payload, feature, tPts, scale, [
    payload.currentDirection === "left" ? arc1 : arc2,
  ]);
  if (direction.markup) {
    html += direction.markup;
    points.push(direction.point);
  }

  return {
    svgMarkup: html,
    viewBox: buildViewBox(points.filter(Boolean), "diamond", mode),
    boxHeight,
  };
}

function renderLshape(payload, metrics) {
  const installType = payload.installType || "stone_base";
  const isSinkTop = installType === "sink_top";
  const boxHeight = 280;
  const hasModelInput = !!String(payload.modelValue || payload.modelInput || "").trim().replace(/\u6b3e/g, "");
  const f = resolveForcedBaseValue(payload.forcedBaseDimensions, "lshape", "f", toNumber(payload.inputs && payload.inputs.f));
  const s = resolveForcedBaseValue(payload.forcedBaseDimensions, "lshape", "s", toNumber(payload.inputs && payload.inputs.s));

  if (!(f + s > 0)) {
    return { svgMarkup: placeholderMarkup(), viewBox: "0 0 500 280", boxHeight };
  }

  const right = payload.lShapeCornerMode === "right";
  const pts = right
    ? [{ x: f, y: -s }, { x: f, y: 0 }, { x: 0, y: 0 }]
    : [{ x: 0, y: -s }, { x: 0, y: 0 }, { x: f, y: 0 }];

  const tf = transform(pts, 500, 280, 0);
  const t = (point) => ({ x: point.x * tf.scale + tf.tx, y: point.y * tf.scale + tf.ty });
  const tPts = pts.map(t);
  const scale = tf.scale;
  const guideTextOffsetPx = (isSinkTop ? 6 : -6) * scale;
  const textOffsetPx = 50 * scale;
  const offPts = [
    getPerpStart(pts[0], pts[1], metrics.modelData.offset, right),
    getLineIntersection(pts[0], pts[1], pts[1], pts[2], metrics.modelData.offset * (right ? -1 : 1)),
    getPerpEnd(pts[1], pts[2], metrics.modelData.offset, right),
  ];

  if (offPts.some((point) => !point)) {
    return { svgMarkup: placeholderMarkup(), viewBox: "0 0 500 280", boxHeight };
  }

  const tOff = offPts.map(t);
  const segS = distance(tOff[0], tOff[1]) || 1;
  const segF = distance(tOff[1], tOff[2]) || 1;
  const rStart = {
    x: tOff[0].x + (tOff[1].x - tOff[0].x) / segS * toNumber(payload.shorten, 0) * scale,
    y: tOff[0].y + (tOff[1].y - tOff[0].y) / segS * toNumber(payload.shorten, 0) * scale,
  };
  const rEnd = {
    x: tOff[2].x - (tOff[2].x - tOff[1].x) / segF * toNumber(payload.shorten, 0) * scale,
    y: tOff[2].y - (tOff[2].y - tOff[1].y) / segF * toNumber(payload.shorten, 0) * scale,
  };

  const suffixText = isSinkTop ? BASE_SUFFIX_SINK : (installType === "room_body" ? BASE_SUFFIX_ROOM : BASE_SUFFIX_STONE);
  const points = tPts.concat(tOff, [rStart, rEnd]);
  const baseLabelMap = {};
  const guideLabelMap = {};
  const forcedAngles = payload.forcedAngleDimensions && payload.forcedAngleDimensions.lshape;
  const cornerAngleDisplay = resolveForcedAngleValue(payload.forcedAngleDimensions, "lshape", "angle-corner", 90);
  let baseLabelsMarkup = "";
  let guideLabelsMarkup = "";
  let html =
    '<line x1="' + rnd(tPts[0].x) + '" y1="' + rnd(tPts[0].y) + '" x2="' + rnd(tPts[1].x) + '" y2="' + rnd(tPts[1].y) + '" class="svg-wall" />' +
    '<line x1="' + rnd(tPts[1].x) + '" y1="' + rnd(tPts[1].y) + '" x2="' + rnd(tPts[2].x) + '" y2="' + rnd(tPts[2].y) + '" class="svg-wall" />';

  if (hasModelInput) {
    html +=
      '<line x1="' + rnd(rStart.x) + '" y1="' + rnd(rStart.y) + '" x2="' + rnd(tOff[1].x) + '" y2="' + rnd(tOff[1].y) + '" class="svg-guide" />' +
      '<line x1="' + rnd(tOff[1].x) + '" y1="' + rnd(tOff[1].y) + '" x2="' + rnd(rEnd.x) + '" y2="' + rnd(rEnd.y) + '" class="svg-guide" />';
  }

  [
    ["s", tPts[0], tPts[1], s, "end"],
    ["f", tPts[1], tPts[2], f, "start"],
  ].forEach((item) => {
    const lab = labelMarkup(item[1], item[2], item[3], suffixText, false, {
      guideTextOffsetPx,
      textOffsetPx,
      textDir: isSinkTop ? -1 : 1,
      baseFactor: 1.42,
      redFactor: 2.15,
      avoid: item[4],
      flipNormal: right && item[0] === "s",
      linkMeta: {
        roomType: "lshape",
        segment: item[0],
      },
      forceMeta: {
        roomType: "lshape",
        segment: item[0],
        active: Number.isFinite(payload.forcedBaseDimensions && payload.forcedBaseDimensions.lshape && payload.forcedBaseDimensions.lshape[item[0]]),
      },
      midlineY: boxHeight / 2,
    });
    baseLabelsMarkup += lab.markup;
    points.push(lab.point);
    baseLabelMap[item[0]] = lab;
  });

  if (hasModelInput) {
    [
      ["s", rStart, tOff[1], metrics.geoLengths.s, "end"],
      ["f", tOff[1], rEnd, metrics.geoLengths.f, "start"],
    ].forEach((item) => {
      const guideOpts = {
        guideTextOffsetPx,
        textOffsetPx,
        scalePx: scale,
        textDir: 1,
        baseFactor: 1.42,
        redFactor: 2.15,
        avoid: item[4],
        flipNormal: right && item[0] === "s",
        linkMeta: {
          roomType: "lshape",
          segment: item[0],
        },
        midlineY: boxHeight / 2,
      };
      let lab = labelMarkup(item[1], item[2], item[3], GUIDE_SUFFIX, true, guideOpts);
      lab = applyGuideLabelSeparation(baseLabelMap[item[0]], lab, item[1], item[2], item[3], GUIDE_SUFFIX, guideOpts);
      guideLabelsMarkup += lab.markup;
      points.push(lab.point);
      guideLabelMap[item[0]] = lab;
    });
  }

  const arc = resolveAngleArcSeparation(tOff[1], tOff[0], tOff[2], 90, {
    displayValue: cornerAngleDisplay,
    scalePx: scale,
    textAttrs: angleForceAttrs("lshape", "angle-corner", cornerAngleDisplay, Number.isFinite(forcedAngles && forcedAngles["angle-corner"])),
  }, [
    baseLabelMap.s,
    guideLabelMap.s,
    baseLabelMap.f,
    guideLabelMap.f,
  ]);
  html += arc.markup;
  html += baseLabelsMarkup + guideLabelsMarkup;
  points.push(arc.point);

  const feature = getModelFeatureType(payload.modelValue || payload.modelInput || "");
  const direction = renderLshapeDirection(payload, feature, tPts, scale);
  if (direction.markup) {
    html += direction.markup;
    points.push(direction.point);
  }

  return {
    svgMarkup: html,
    viewBox: buildViewBox(points.filter(Boolean), "lshape", "default"),
    boxHeight,
  };
}

// ── Isometric 3D renderer ──────────────────────────────────────────

function renderIsometric3D(payload, metrics) {
  const roomType = metrics.roomType || "diamond";
  const shorten = toNumber(payload.shorten, 0);
  const offset = metrics.modelData ? metrics.modelData.offset : 0;
  const feature = getModelFeatureType(payload.modelValue || payload.modelInput || "");
  const direction = payload.currentDirection || "none";

  let wallPts, glassPts;

  if (roomType === "diamond") {
    const pts = Array.isArray(metrics.wallPoints) && metrics.wallPoints.length === 4 ? metrics.wallPoints : null;
    if (!pts) return null;
    wallPts = pts;
    const g0 = getPerpStart(pts[0], pts[1], offset);
    const g1 = getLineIntersection(pts[0], pts[1], pts[1], pts[2], offset);
    const g2 = getLineIntersection(pts[1], pts[2], pts[2], pts[3], offset);
    const g3 = getPerpEnd(pts[2], pts[3], offset);
    if (!g0 || !g1 || !g2 || !g3) return null;
    const gs = getShortenedPoint(g0, g1, shorten);
    const ge = getShortenedPoint(g3, g2, shorten);
    glassPts = [gs, g1, g2, ge];
  } else {
    const right = payload.lShapeCornerMode === "right";
    const f = toNumber(payload.inputs && payload.inputs.f);
    const s = toNumber(payload.inputs && payload.inputs.s);
    if (!(f + s > 0)) return null;
    const pts = right
      ? [{ x: f, y: -s }, { x: f, y: 0 }, { x: 0, y: 0 }]
      : [{ x: 0, y: -s }, { x: 0, y: 0 }, { x: f, y: 0 }];
    wallPts = pts;
    const g0 = getPerpStart(pts[0], pts[1], offset, right);
    const g1 = getLineIntersection(pts[0], pts[1], pts[1], pts[2], offset * (right ? -1 : 1));
    const g2 = getPerpEnd(pts[1], pts[2], offset, right);
    if (!g0 || !g1 || !g2) return null;
    const gs = getShortenedPoint(g0, g1, shorten);
    const ge = getShortenedPoint(g2, g1, shorten);
    glassPts = [gs, g1, ge];
  }

  // Projection parameters differ by room type
  // Diamond: front-facing oblique (正前方俯斜视), steep angle
  // L-shape: diagonal isometric (正斜角), balanced angle to show both walls
  const depthAngle = roomType === "diamond" ? (75 * Math.PI / 180) : (45 * Math.PI / 180);
  const depthScale = roomType === "diamond" ? 0.35 : 0.45;
  const depthDx = Math.cos(depthAngle) * depthScale;
  const depthDy = Math.sin(depthAngle) * depthScale;
  const heightMM = 1900;
  const allFloorPts = wallPts.concat(glassPts);

  const installType = payload.installType || "stone_base";
  const isSinkTop = installType === "sink_top";
  const baseSuffix = isSinkTop ? "\u4e0b\u6c89\u533a" : (installType === "room_body" ? "\u623f\u4f53" : "\u77f3\u57fa");
  const hasModelInput = !!String(payload.modelValue || payload.modelInput || "").trim().replace(/\u6b3e/g, "");

  function isoProject(pt, z) {
    return {
      x: pt.x + pt.y * depthDx,
      y: pt.y * depthDy - z,
    };
  }

  // Compute bounding box
  const allProjected = [];
  allFloorPts.forEach(function(pt) {
    allProjected.push(isoProject(pt, 0));
    allProjected.push(isoProject(pt, heightMM));
  });
  const xs = allProjected.map(function(p) { return p.x; });
  const ys = allProjected.map(function(p) { return p.y; });
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);

  const canvasW = 500;
  const canvasH = 400;
  const pad = 30;
  const scaleX = (canvasW - pad * 2) / ((maxX - minX) || 1);
  const scaleY = (canvasH - pad * 2) / ((maxY - minY) || 1);
  const sc = Math.min(scaleX, scaleY);
  const offX = canvasW / 2 - ((minX + maxX) / 2) * sc;
  const offY = canvasH / 2 - ((minY + maxY) / 2) * sc;

  function proj(pt, z) {
    const ip = isoProject(pt, z || 0);
    return { x: rnd(ip.x * sc + offX), y: rnd(ip.y * sc + offY) };
  }

  function projRaw(pt, z) {
    const ip = isoProject(pt, z || 0);
    return { x: ip.x * sc + offX, y: ip.y * sc + offY };
  }

  function quadPath(p0, p1, p2, p3) {
    return "M " + p0.x + " " + p0.y + " L " + p1.x + " " + p1.y + " L " + p2.x + " " + p2.y + " L " + p3.x + " " + p3.y + " Z";
  }

  function dimLabel(pA, pB, text, side, color) {
    var mx = (pA.x + pB.x) / 2;
    var my = (pA.y + pB.y) / 2;
    var offPx = side === "below" ? 14 : -14;
    return '<text x="' + rnd(mx) + '" y="' + rnd(my + offPx) + '" text-anchor="middle" fill="' + (color || "#333") + '" font-size="11" font-weight="700" font-family="monospace" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(text) + '</text>';
  }

  let html = "";
  const h = heightMM;

  // Draw wall panels (light gray fill)
  for (let i = 0; i < wallPts.length - 1; i++) {
    const bf = proj(wallPts[i], 0);
    const bf2 = proj(wallPts[i + 1], 0);
    const bt = proj(wallPts[i], h);
    const bt2 = proj(wallPts[i + 1], h);
    html += '<path d="' + quadPath(bf, bf2, bt2, bt) + '" fill="#e8e8e8" stroke="#999" stroke-width="0.8" opacity="0.35" />';
  }

  // Draw glass panels
  if (roomType === "diamond") {
    // 3 glass segments: left fixed, center door, right fixed
    const segments = [
      { from: glassPts[0], to: glassPts[1], type: "fixed" },
      { from: glassPts[1], to: glassPts[2], type: "door" },
      { from: glassPts[2], to: glassPts[3], type: "fixed" },
    ];
    segments.forEach(function(seg) {
      const bf = proj(seg.from, 0);
      const bf2 = proj(seg.to, 0);
      const bt = proj(seg.from, h);
      const bt2 = proj(seg.to, h);
      const isDoor = seg.type === "door";
      const fillColor = isDoor ? "rgba(173,216,230,0.22)" : "rgba(173,216,230,0.18)";
      const strokeColor = isDoor ? "#555" : "#666";
      const strokeW = isDoor ? "1.8" : "1.2";

      // Glass panel
      html += '<path d="' + quadPath(bf, bf2, bt2, bt) + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="' + strokeW + '" />';
    });

    // Top frame lines
    segments.forEach(function(seg) {
      const bt = proj(seg.from, h);
      const bt2 = proj(seg.to, h);
      html += '<line x1="' + bt.x + '" y1="' + bt.y + '" x2="' + bt2.x + '" y2="' + bt2.y + '" stroke="#444" stroke-width="3" />';
    });
    // Bottom frame lines
    segments.forEach(function(seg) {
      const bf = proj(seg.from, 0);
      const bf2 = proj(seg.to, 0);
      html += '<line x1="' + bf.x + '" y1="' + bf.y + '" x2="' + bf2.x + '" y2="' + bf2.y + '" stroke="#444" stroke-width="2.5" />';
    });
    // Vertical frame lines at glass edges/joints
    for (let i = 0; i < glassPts.length; i++) {
      const pf = proj(glassPts[i], 0);
      const pt = proj(glassPts[i], h);
      const sw = (i === 0 || i === glassPts.length - 1) ? "1.5" : "2.5";
      html += '<line x1="' + pf.x + '" y1="' + pf.y + '" x2="' + pt.x + '" y2="' + pt.y + '" stroke="#444" stroke-width="' + sw + '" />';
    }

    // Door handle — on glass surface, opposite side of hinge axis
    if (direction !== "none") {
      const doorFrom = glassPts[1];
      const doorTo = glassPts[2];
      const t = 0.12;
      const handlePt = direction === "left"
        ? { x: doorTo.x + (doorFrom.x - doorTo.x) * t, y: doorTo.y + (doorFrom.y - doorTo.y) * t }
        : { x: doorFrom.x + (doorTo.x - doorFrom.x) * t, y: doorFrom.y + (doorTo.y - doorFrom.y) * t };
      const p1 = proj(handlePt, h * 0.42);
      const p2 = proj(handlePt, h * 0.58);
      html += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="#333" stroke-width="3.5" stroke-linecap="round" />';
    }

    // ── Diamond dimension labels ──
    const baseVals = metrics.displayBaseValues || {};
    const guideVals = metrics.displayGuideValues || metrics.geoLengths || {};
    var wbf0 = projRaw(wallPts[0], 0), wbf1 = projRaw(wallPts[1], 0);
    var wbf2 = projRaw(wallPts[2], 0), wbf3 = projRaw(wallPts[3], 0);
    if (baseVals.l > 0) html += dimLabel(wbf0, wbf1, Math.round(baseVals.l) + " " + baseSuffix, "below", "#333");
    if (baseVals.c > 0) html += dimLabel(wbf1, wbf2, Math.round(baseVals.c) + " " + baseSuffix, "below", "#333");
    if (baseVals.r > 0) html += dimLabel(wbf2, wbf3, Math.round(baseVals.r) + " " + baseSuffix, "below", "#333");
    if (hasModelInput) {
      var gbf0 = projRaw(glassPts[0], 0), gbf1 = projRaw(glassPts[1], 0);
      var gbf2 = projRaw(glassPts[2], 0), gbf3 = projRaw(glassPts[3], 0);
      if (guideVals.l > 0) html += dimLabel(gbf0, gbf1, Math.round(guideVals.l) + " \u6750\u6599\u5c3a\u5bf8", "above", "#dc2626");
      if (guideVals.c > 0) html += dimLabel(gbf1, gbf2, Math.round(guideVals.c) + " \u6750\u6599\u5c3a\u5bf8", "above", "#dc2626");
      if (guideVals.r > 0) html += dimLabel(gbf2, gbf3, Math.round(guideVals.r) + " \u6750\u6599\u5c3a\u5bf8", "above", "#dc2626");
    }

    // ── Angle labels at top of shower room ──
    var angles = metrics.calculatedAngles || {};
    if (angles.l > 0 && angles.l !== 90) {
      var aP = projRaw(wallPts[1], h);
      html += '<text x="' + rnd(aP.x) + '" y="' + rnd(aP.y - 10) + '" text-anchor="middle" fill="#1d4ed8" font-size="12" font-weight="700" font-family="monospace" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(rnd(angles.l) + "\u00b0") + '</text>';
    }
    if (angles.r > 0 && angles.r !== 90) {
      var aP2 = projRaw(wallPts[2], h);
      html += '<text x="' + rnd(aP2.x) + '" y="' + rnd(aP2.y - 10) + '" text-anchor="middle" fill="#1d4ed8" font-size="12" font-weight="700" font-family="monospace" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(rnd(angles.r) + "\u00b0") + '</text>';
    }
  } else {
    // L-shape: 2 glass segments
    const segments = [
      { from: glassPts[0], to: glassPts[1], type: "fixed" },
      { from: glassPts[1], to: glassPts[2], type: "door" },
    ];
    segments.forEach(function(seg) {
      const bf = proj(seg.from, 0);
      const bf2 = proj(seg.to, 0);
      const bt = proj(seg.from, h);
      const bt2 = proj(seg.to, h);
      const isDoor = seg.type === "door";
      const fillColor = isDoor ? "rgba(173,216,230,0.22)" : "rgba(173,216,230,0.18)";
      const strokeColor = isDoor ? "#555" : "#666";
      const strokeW = isDoor ? "1.8" : "1.2";

      html += '<path d="' + quadPath(bf, bf2, bt2, bt) + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="' + strokeW + '" />';
    });

    // Top frame lines
    segments.forEach(function(seg) {
      const bt = proj(seg.from, h);
      const bt2 = proj(seg.to, h);
      html += '<line x1="' + bt.x + '" y1="' + bt.y + '" x2="' + bt2.x + '" y2="' + bt2.y + '" stroke="#444" stroke-width="3" />';
    });
    // Bottom frame lines
    segments.forEach(function(seg) {
      const bf = proj(seg.from, 0);
      const bf2 = proj(seg.to, 0);
      html += '<line x1="' + bf.x + '" y1="' + bf.y + '" x2="' + bf2.x + '" y2="' + bf2.y + '" stroke="#444" stroke-width="2.5" />';
    });
    // Vertical frame lines at glass edges/joints
    for (let i = 0; i < glassPts.length; i++) {
      const pf = proj(glassPts[i], 0);
      const pt = proj(glassPts[i], h);
      const sw = (i === 0 || i === glassPts.length - 1) ? "1.5" : "2.5";
      html += '<line x1="' + pf.x + '" y1="' + pf.y + '" x2="' + pt.x + '" y2="' + pt.y + '" stroke="#444" stroke-width="' + sw + '" />';
    }

    // Door handle — on glass surface, opposite side of hinge axis
    if (direction !== "none") {
      const dFrom = glassPts[1];
      const dTo = glassPts[2];
      const t = 0.12;
      const handlePt = direction === "left"
        ? { x: dTo.x + (dFrom.x - dTo.x) * t, y: dTo.y + (dFrom.y - dTo.y) * t }
        : { x: dFrom.x + (dTo.x - dFrom.x) * t, y: dFrom.y + (dTo.y - dFrom.y) * t };
      const p1 = proj(handlePt, h * 0.42);
      const p2 = proj(handlePt, h * 0.58);
      html += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="#333" stroke-width="3.5" stroke-linecap="round" />';
    }

    // ── L-shape dimension labels ──
    const baseVals = metrics.displayBaseValues || {};
    const guideVals = metrics.displayGuideValues || metrics.geoLengths || {};
    var wf0 = projRaw(wallPts[0], 0), wf1 = projRaw(wallPts[1], 0), wf2 = projRaw(wallPts[2], 0);
    if (baseVals.s > 0) html += dimLabel(wf0, wf1, Math.round(baseVals.s) + " " + baseSuffix, "below", "#333");
    if (baseVals.f > 0) html += dimLabel(wf1, wf2, Math.round(baseVals.f) + " " + baseSuffix, "below", "#333");
    if (hasModelInput) {
      var gf0 = projRaw(glassPts[0], 0), gf1 = projRaw(glassPts[1], 0), gf2 = projRaw(glassPts[2], 0);
      if (guideVals.s > 0) html += dimLabel(gf0, gf1, Math.round(guideVals.s) + " \u6750\u6599\u5c3a\u5bf8", "above", "#dc2626");
      if (guideVals.f > 0) html += dimLabel(gf1, gf2, Math.round(guideVals.f) + " \u6750\u6599\u5c3a\u5bf8", "above", "#dc2626");
    }
  }

  // Wall corner vertical lines
  wallPts.forEach(function(pt) {
    const pf = proj(pt, 0);
    var ptop = proj(pt, h);
    html += '<line x1="' + pf.x + '" y1="' + pf.y + '" x2="' + ptop.x + '" y2="' + ptop.y + '" stroke="#bbb" stroke-width="0.6" stroke-dasharray="4,3" />';
  });

  // Top wall edges (dashed)
  for (let i = 0; i < wallPts.length - 1; i++) {
    const pt1 = proj(wallPts[i], h);
    const pt2 = proj(wallPts[i + 1], h);
    html += '<line x1="' + pt1.x + '" y1="' + pt1.y + '" x2="' + pt2.x + '" y2="' + pt2.y + '" stroke="#bbb" stroke-width="0.6" stroke-dasharray="4,3" />';
  }

  const vb = "0 0 " + canvasW + " " + canvasH;
  return { svgMarkup: html, viewBox: vb, boxHeight: canvasH };
}

export function renderProtectedDiagram(payload = {}) {
  const metrics = calculateProtectedMetrics(payload || {});
  const render = metrics.roomType === "lshape"
    ? renderLshape(payload || {}, metrics)
    : renderDiamond(payload || {}, metrics);

  let iso3d = null;
  try {
    iso3d = renderIsometric3D(payload || {}, metrics);
  } catch (_) {}

  return { ...metrics, ...render, iso3d };
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    return Response.json(
      renderProtectedDiagram(payload || {}),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: "RENDER_REQUEST_INVALID",
        message: error && error.message ? error.message : "Invalid request body.",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
