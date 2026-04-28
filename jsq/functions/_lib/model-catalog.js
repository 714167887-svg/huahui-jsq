// HUAHUI 款式目录（打样阶段仅一款）
// 与 jsq 版本结构对齐，方便未来扩款

export const MODEL_CATALOG = {
  "HY-050": {
    key: "HY-050",
    name: "HY-050",
    featureLabel: "开门 · 转轴",
    featureType: "hinged",
    pivotType: "pivot",
  },
};

export function normalizeModelValue(value) {
  return String(value == null ? "" : value).trim().replace(/\u6b3e/g, "");
}

export function findModelCatalogEntry(value) {
  const key = normalizeModelValue(value);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(MODEL_CATALOG, key)) {
    return MODEL_CATALOG[key];
  }
  for (const entryKey of Object.keys(MODEL_CATALOG)) {
    if (key.startsWith(entryKey)) return MODEL_CATALOG[entryKey];
  }
  return null;
}

export function getModelFeatureLabel(value) {
  const entry = findModelCatalogEntry(value);
  return entry ? entry.featureLabel : "";
}

export function getModelFeatureType(value) {
  const entry = findModelCatalogEntry(value);
  return entry ? entry.featureType : "";
}

export function getPublicModelCatalog() {
  return Object.values(MODEL_CATALOG).map((entry) => ({
    key: entry.key,
    name: entry.name,
    feature: entry.featureLabel,
  }));
}
