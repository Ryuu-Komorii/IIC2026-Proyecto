const YEAR_FILES = [2021, 2022, 2023, 2024, 2025].map((year) => ({
  year,
  file: `db/agents_pick_rates_${year}.csv`,
}));

const COLORS = {
  annual: ["#2f3643", "#374153", "#2f3643"],
  overall: ["#7e232b", "#b93945", "#fe4553"],
};

const timelineContainer = document.getElementById("timelineYears");
const yearNodesContainer = document.getElementById("yearNodes");
const overallContainer = document.getElementById("overallBubbles");

boot();

async function boot() {
  try {
    const loadedYears = (await Promise.all(YEAR_FILES.map(loadYearFile))).filter(Boolean);

    if (!loadedYears.length) {
      throw new Error("No se pudieron cargar los CSV.");
    }

    const overall = aggregateOverall(loadedYears);
    const maxDisplayedRate = Math.max(
      ...loadedYears.flatMap((yearBlock) => yearBlock.topAgents.map((entry) => entry.average)),
      ...overall.map((entry) => entry.average)
    );

    renderTimeline(loadedYears, maxDisplayedRate);
    renderOverall(overall, maxDisplayedRate);
  } catch (error) {
    timelineContainer.innerHTML = `<div class="empty-state">${error.message}<br><br>Si abriste el HTML con doble clic, prueba servir la carpeta con un servidor local.</div>`;
    yearNodesContainer.innerHTML = "";
    overallContainer.innerHTML = "";
    console.error(error);
  }
}

async function loadYearFile({ year, file }) {
  try {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error(`No se encontró ${file}`);
    }
    const text = await response.text();
    const rows = parseCSV(text);
    const aggregate = aggregateYear(rows, year);
    if (!aggregate.topAgents.length) return null;
    return aggregate;
  } catch (error) {
    console.warn(`Omitiendo ${year}:`, error.message);
    return null;
  }
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function aggregateYear(rows, year) {
  const preferred = rows.filter(
    (row) =>
      equalsIgnoreCase(row.Stage, "All Stages") &&
      equalsIgnoreCase(row["Match Type"], "All Match Types") &&
      equalsIgnoreCase(row.Map, "All Maps")
  );

  const sourceRows = preferred.length ? preferred : rows;
  const grouped = new Map();

  sourceRows.forEach((row) => {
    const agent = normalizeAgentLabel(row.Agent);
    const rate = parsePickRate(row["Pick Rate"]);

    if (!agent || Number.isNaN(rate)) return;

    if (!grouped.has(agent)) {
      grouped.set(agent, { agent, values: [] });
    }

    grouped.get(agent).values.push(rate);
  });

  const aggregates = [...grouped.values()]
    .map(({ agent, values }) => ({
      agent,
      average: average(values),
      asset: assetPath(agent),
    }))
    .sort((a, b) => b.average - a.average);

  return {
    year,
    topAgents: aggregates.slice(0, 3),
    allAgents: aggregates,
  };
}

function aggregateOverall(years) {
  const map = new Map();

  years.forEach((yearBlock) => {
    yearBlock.allAgents.forEach((entry) => {
      if (!map.has(entry.agent)) {
        map.set(entry.agent, { agent: entry.agent, values: [], asset: entry.asset });
      }
      map.get(entry.agent).values.push(entry.average);
    });
  });

  return [...map.values()]
    .map(({ agent, values, asset }) => ({
      agent,
      average: average(values),
      yearsPresent: values.length,
      asset,
    }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 3);
}

function renderTimeline(years, maxDisplayedRate) {
  timelineContainer.innerHTML = "";
  yearNodesContainer.innerHTML = "";

  const positions = distributePositions(years.length);
  const centers = [50, 105, 160];
  const aboveCenterY = -128;
  const belowCenterY = 128;

  years.forEach((block, index) => {
    const isAbove = index % 2 === 1;
    const left = `${positions[index]}%`;

    const yearNode = document.createElement("div");
    yearNode.className = "year-node";
    yearNode.style.left = left;
    yearNode.innerHTML = `
      <span class="year-label">${block.year}</span>
      <span class="year-dot"></span>
    `;
    yearNodesContainer.appendChild(yearNode);

    const group = document.createElement("article");
    group.className = `year-group ${isAbove ? "above" : "below"}`;
    group.style.left = left;
    group.style.top = "50%";

    const stack = document.createElement("div");
    stack.className = "bubble-stack";

    const orderedForDepth = [...block.topAgents].sort((a, b) => a.average - b.average);

    orderedForDepth.forEach((agent) => {
      const rank = block.topAgents.findIndex((item) => item.agent === agent.agent);
      const size = pickRateToDiameter(agent.average, maxDisplayedRate, "annual");
      const radius = size / 2;
      const centerY = isAbove ? aboveCenterY : belowCenterY;

      const bubble = createBubble({
        entry: agent,
        size,
        left: centers[rank] - radius,
        top: centerY - radius,
        color: COLORS.annual[rank % COLORS.annual.length],
        mode: "annual",
        zIndex: Math.round(size),
      });

      stack.appendChild(bubble);
    });

    group.appendChild(stack);
    timelineContainer.appendChild(group);
  });
}

function renderOverall(entries, maxDisplayedRate) {
  overallContainer.innerHTML = "";

  if (!entries.length) {
    overallContainer.innerHTML = `<div class="empty-state">No hay suficientes datos para calcular el top general.</div>`;
    return;
  }

  const yPositions = [28, 50, 72];
  const orderedForDepth = [...entries].sort((a, b) => a.average - b.average);

  orderedForDepth.forEach((entry) => {
    const index = entries.findIndex((item) => item.agent === entry.agent);
    const card = document.createElement("article");
    card.className = "overall-card";
    card.style.top = `${yPositions[index]}%`;
    card.style.zIndex = String(Math.round(entry.average));

    const size = pickRateToDiameter(entry.average, maxDisplayedRate, "overall");
    const bubble = createBubble({
      entry,
      size,
      left: -size / 2,
      top: -size / 2,
      color: COLORS.overall[index % COLORS.overall.length],
      mode: "overall",
      zIndex: Math.round(size),
    });

    card.appendChild(bubble);
    overallContainer.appendChild(card);
  });
}

function createBubble({ entry, size, left, top, color, mode, zIndex = 1 }) {
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = `bubble ${mode}`;
  bubble.style.setProperty("--size", `${size}px`);
  bubble.style.setProperty("--left", `${left}px`);
  bubble.style.setProperty("--top", `${top}px`);
  bubble.style.setProperty("--bubble-color", color);
  bubble.style.zIndex = String(zIndex);
  bubble.dataset.defaultZ = String(zIndex);
  bubble.setAttribute("aria-label", `${capitalize(entry.agent)} ${formatRate(entry.average)}`);

  const img = document.createElement("img");
  img.src = entry.asset;
  img.alt = capitalize(entry.agent);
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.classList.add("is-missing");
  });

  const fallback = document.createElement("span");
  fallback.className = "bubble-fallback";
  fallback.textContent = initials(entry.agent);
  fallback.style.fontSize = `${Math.max(12, size * 0.2)}px`;

  const rate = document.createElement("span");
  rate.className = "bubble-rate";
  rate.textContent = formatRate(entry.average);

  bubble.append(img, fallback, rate);
  bubble.addEventListener("mouseenter", () => activateBubble(bubble));
  bubble.addEventListener("mouseleave", () => deactivateBubble(bubble));
  bubble.addEventListener("focus", () => activateBubble(bubble));
  bubble.addEventListener("blur", () => deactivateBubble(bubble));

  return bubble;
}

function activateBubble(bubble) {
  bubble.classList.add("is-hovered");
  bubble.style.zIndex = "999";
  const parentCard = bubble.closest(".overall-card");
  if (parentCard) parentCard.style.zIndex = "999";
}

function deactivateBubble(bubble) {
  bubble.classList.remove("is-hovered");
  bubble.style.zIndex = bubble.dataset.defaultZ;
  const parentCard = bubble.closest(".overall-card");
  if (parentCard) parentCard.style.zIndex = bubble.dataset.defaultZ;
}

function pickRateToDiameter(value, maxDisplayedRate, mode) {
  const maxDiameter = mode === "overall" ? 116 : 94;
  return Math.sqrt(Math.max(0, value) / maxDisplayedRate) * maxDiameter;
}

function distributePositions(count) {
  if (count === 1) return [50];
  const start = 10;
  const end = 90;
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

function parsePickRate(value) {
  return Number.parseFloat(String(value ?? "").replace("%", "").trim());
}

function normalizeAgentLabel(agent) {
  return String(agent ?? "")
    .trim()
    .toLowerCase();
}

function capitalize(text) {
  return String(text)
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function initials(text) {
  const clean = String(text).trim().toUpperCase();
  return clean.length <= 3 ? clean : clean.slice(0, 3);
}

function assetPath(agent) {
  const filename = String(agent)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");

  return `assets/${filename}-icon.png`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function equalsIgnoreCase(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function formatRate(value) {
  return `${value.toFixed(1)}%`;
}
