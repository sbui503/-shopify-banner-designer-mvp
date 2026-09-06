export type ShopifyCustomAttribute = {
  key?: string | null;
  value?: string | null;
};

const SERIALIZED_FORM_KEYS = new Set([
  "tsb custom form json",
  "custom form json"
]);

function displayKey(value: unknown) {
  return String(value || "")
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparisonKey(value: unknown) {
  return displayKey(value).toLowerCase();
}

function canonicalKey(value: unknown) {
  return displayKey(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function serializedFields(attribute: ShopifyCustomAttribute) {
  if (!SERIALIZED_FORM_KEYS.has(comparisonKey(attribute.key))) return [];
  try {
    const parsed = JSON.parse(String(attribute.value || ""));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return [];
    return Object.entries(parsed as Record<string, unknown>)
      .filter(([key]) => displayKey(key))
      .map(([key, value]) => ({
        key: displayKey(key),
        value: value == null
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value)
      }));
  } catch {
    return [];
  }
}

export function normalizeShopifyAttributes(attributes: ShopifyCustomAttribute[] = []) {
  const normalized: ShopifyCustomAttribute[] = [];
  const positions = new Map<string, number>();
  const serialized: ShopifyCustomAttribute[] = [];

  attributes.forEach((attribute) => {
    if (SERIALIZED_FORM_KEYS.has(comparisonKey(attribute.key))) {
      const fields = serializedFields(attribute);
      if (fields.length) {
        serialized.push(...fields);
        return;
      }
    }

    const key = displayKey(attribute.key);
    if (!key) return;
    const mapKey = comparisonKey(key);
    const next = { key, value: String(attribute.value || "") };
    const position = positions.get(mapKey);
    if (position == null) {
      positions.set(mapKey, normalized.length);
      normalized.push(next);
      return;
    }
    if (!String(normalized[position].value || "").trim() && String(next.value || "").trim()) {
      normalized[position] = next;
    }
  });

  serialized.forEach((attribute) => {
    const key = displayKey(attribute.key);
    const mapKey = comparisonKey(key);
    const position = positions.get(mapKey);
    if (position == null) {
      positions.set(mapKey, normalized.length);
      normalized.push({ key, value: String(attribute.value || "") });
      return;
    }
    if (!String(normalized[position].value || "").trim() && String(attribute.value || "").trim()) {
      normalized[position] = { key, value: String(attribute.value || "") };
    }
  });

  return normalized;
}

function valueFor(attributes: ShopifyCustomAttribute[], keys: string[]) {
  const wanted = new Set(keys);
  return String(attributes.find((attribute) => wanted.has(canonicalKey(attribute.key)))?.value || "").trim();
}

export function customOrderSummary(attributes: ShopifyCustomAttribute[] = []) {
  const normalized = normalizeShopifyAttributes(attributes);
  const expectedPlayers = Number.parseInt(valueFor(normalized, ["numberofplayers"]), 10) || 0;
  const playerNames = normalized.filter((attribute) => /^player\d+name$/.test(canonicalKey(attribute.key)) && String(attribute.value || "").trim());
  const playerPhotos = normalized.filter((attribute) => /^player\d+photo$/.test(canonicalKey(attribute.key)) && String(attribute.value || "").trim());

  return {
    attributes: normalized,
    fieldCount: normalized.length,
    teamName: valueFor(normalized, ["teamlogoname", "teamname"]),
    teamLogo: valueFor(normalized, ["teamlogo"]),
    sport: valueFor(normalized, ["sport"]),
    bannerType: valueFor(normalized, ["bannertype"]),
    svgLayout: valueFor(normalized, ["svglayout"]),
    expectedPlayers,
    playerNameCount: playerNames.length,
    playerPhotoCount: playerPhotos.length
  };
}

export type CustomOrderPlayer = {
  index: number;
  name: string;
  number: string;
  photo: string;
};

export type CustomOrderDesignInput = {
  attributes: ShopifyCustomAttribute[];
  teamName: string;
  teamLogo: string;
  sport: string;
  bannerType: string;
  svgLayout: string;
  manager: string;
  assistantManager: string;
  coach: string;
  assistantCoach: string;
  teamMomDad: string;
  sponsors: string;
  designNotes: string;
  expectedPlayers: number;
  players: CustomOrderPlayer[];
};

export function customOrderDesignInput(attributes: ShopifyCustomAttribute[] = []): CustomOrderDesignInput {
  const normalized = normalizeShopifyAttributes(attributes);
  const playerFields = new Map<number, CustomOrderPlayer>();

  normalized.forEach((attribute) => {
    const match = canonicalKey(attribute.key).match(/^player(\d+)(name|number|photo)$/);
    if (!match) return;
    const index = Number.parseInt(match[1], 10);
    if (!Number.isFinite(index) || index < 1 || index > 50) return;
    const player = playerFields.get(index) || { index, name: "", number: "", photo: "" };
    player[match[2] as "name" | "number" | "photo"] = String(attribute.value || "").trim();
    playerFields.set(index, player);
  });

  const declaredPlayers = Math.max(0, Math.min(20, Number.parseInt(valueFor(normalized, ["numberofplayers"]), 10) || 0));
  const highestPlayerIndex = Math.max(0, ...playerFields.keys());
  const playerCount = Math.max(declaredPlayers, highestPlayerIndex);
  const players = Array.from({ length: playerCount }, (_, offset) => {
    const index = offset + 1;
    return playerFields.get(index) || { index, name: "", number: "", photo: "" };
  });

  return {
    attributes: normalized,
    teamName: valueFor(normalized, ["teamlogoname", "teamname"]),
    teamLogo: valueFor(normalized, ["teamlogo"]),
    sport: valueFor(normalized, ["sport"]),
    bannerType: valueFor(normalized, ["bannertype"]),
    svgLayout: valueFor(normalized, ["svglayout"]),
    manager: valueFor(normalized, ["teammanagers", "teammanager", "manager"]),
    assistantManager: valueFor(normalized, ["asstmanagers", "asstmanager", "assistantmanagers", "assistantmanager"]),
    coach: valueFor(normalized, ["coach", "coachname"]),
    assistantCoach: valueFor(normalized, ["asstcoach", "assistantcoach"]),
    teamMomDad: valueFor(normalized, ["teammomdad", "teammom", "teamdad"]),
    sponsors: valueFor(normalized, ["teamsponsors", "teamsponsor", "sponsors", "sponsor"]),
    designNotes: valueFor(normalized, ["designnotes", "designinstructions", "specialinstructions", "notes"]),
    expectedPlayers: playerCount,
    players
  };
}
