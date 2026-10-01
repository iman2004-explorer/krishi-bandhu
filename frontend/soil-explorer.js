const STATE_GEOJSON_URL = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson";
const DISTRICT_GEOJSON_URL = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2_simplified.geojson";
const SOIL_PROPERTIES = ["phh2o", "sand", "silt", "clay", "nitrogen", "soc", "wv0033", "wv1500"];

export function initializeSoilExplorer() {
  const dialog = document.getElementById("soilExplorerDialog");
  if (!dialog) return;

  const openButton = document.getElementById("openSoilExplorer");
  const closeButton = document.getElementById("closeSoilExplorer");
  const backButton = document.getElementById("soilSelectionBack");
  const breadcrumb = document.getElementById("soilSelectionBreadcrumb");
  const status = document.getElementById("soilSelectionStatus");
  const choiceHeading = document.getElementById("soilChoiceHeading");
  const choiceDescription = document.getElementById("soilChoiceDescription");
  const choiceList = document.getElementById("soilChoiceList");
  const districtSearch = document.getElementById("soilDistrictSearch");
  const report = document.getElementById("soilReport");
  const previewTexture = document.getElementById("soilPreviewTexture");
  const previewChemistry = document.getElementById("soilPreviewChemistry");
  const previewCrops = document.getElementById("soilPreviewCrops");

  let geoPromise;
  let stateFeatures = [];
  let districtFeatures = [];
  let activeState;
  let visibleDistricts = [];

  function loadGeoLibrary() {
    if (!geoPromise) geoPromise = import("https://cdn.jsdelivr.net/npm/d3-geo@3/+esm");
    return geoPromise;
  }

  async function fetchGeoJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Map download failed (${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error("The map data is not in the expected format.");
    return data.features.map(feature => {
      const reverseRings = polygon => polygon.map(ring => [...ring].reverse());
      const geometry = feature.geometry;
      if (geometry.type === "Polygon") {
        return { ...feature, geometry: { ...geometry, coordinates: reverseRings(geometry.coordinates) } };
      }
      if (geometry.type === "MultiPolygon") {
        return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map(reverseRings) } };
      }
      return feature;
    });
  }

  function featureName(feature) {
    return (feature.properties.shapeName || "Unnamed district")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function renderChoiceList(features) {
    choiceList.replaceChildren();
    choiceList.setAttribute("aria-label", activeState ? `Districts in ${featureName(activeState)}` : "Indian states");
    const sortedFeatures = [...features].sort((left, right) => featureName(left).localeCompare(featureName(right)));
    for (const feature of sortedFeatures) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "soil-choice";
      const name = document.createElement("span");
      name.textContent = featureName(feature);
      button.append(name);
      button.addEventListener("click", () => selectFeature(feature));
      choiceList.append(button);
    }
  }

  function districtsForState(state, geo = window.soilGeo) {
    const stateName = featureName(state).toLocaleLowerCase();
    return districtFeatures.filter(district => {
      const center = geo.geoCentroid(district);
      if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return false;
      if (geo.geoContains(state, center)) return true;
      return stateName === "jammu and kashmir" && /ladakh/i.test(featureName(district));
    });
  }

  async function showStates() {
    activeState = null;
    report.hidden = true;
    backButton.hidden = true;
    districtSearch.hidden = false;
    districtSearch.value = "";
    districtSearch.placeholder = "Find a state";
    districtSearch.setAttribute("aria-label", "Find a state");
    breadcrumb.textContent = "India";
    choiceHeading.textContent = "Choose a state";
    choiceDescription.textContent = "Select a state from the list.";
    if (!stateFeatures.length) {
      status.textContent = "Loading state map...";
      const [geo, features] = await Promise.all([
        loadGeoLibrary(),
        fetchGeoJSON(STATE_GEOJSON_URL)
      ]);
      window.soilGeo = geo;
      stateFeatures = features;
    }
    renderChoiceList(stateFeatures);
    status.textContent = `${stateFeatures.length} states and union territories`;
  }

  async function showDistricts(state) {
    activeState = state;
    report.hidden = true;
    backButton.hidden = false;
    districtSearch.hidden = false;
    districtSearch.value = "";
    districtSearch.placeholder = "Find a district";
    districtSearch.setAttribute("aria-label", "Find a district");
    breadcrumb.textContent = `India / ${featureName(state)}`;
    choiceHeading.textContent = `Districts in ${featureName(state)}`;
    choiceDescription.textContent = "Select a district from the list.";
    status.textContent = "Loading district boundaries...";
    if (!districtFeatures.length) districtFeatures = await fetchGeoJSON(DISTRICT_GEOJSON_URL);
    visibleDistricts = districtsForState(state);
    if (!visibleDistricts.length) throw new Error(`District boundaries are unavailable for ${featureName(state)}.`);
    renderChoiceList(visibleDistricts);
    status.textContent = `${visibleDistricts.length} districts`;
  }

  function updateChoiceSearch() {
    const term = districtSearch.value.trim().toLocaleLowerCase();
    const features = activeState ? visibleDistricts : stateFeatures;
    const filtered = term ? features.filter(feature => featureName(feature).toLocaleLowerCase().includes(term)) : features;
    renderChoiceList(filtered);
    status.textContent = activeState
      ? `${filtered.length} districts`
      : `${filtered.length} states and union territories`;
  }

  function weightedProfile(layer) {
    const weights = [5, 10, 15];
    const values = layer?.depths || [];
    let total = 0;
    let weightTotal = 0;
    values.forEach((depth, index) => {
      const value = depth.values?.mean;
      if (Number.isFinite(value)) {
        const weight = weights[index] || 0;
        total += value * weight;
        weightTotal += weight;
      }
    });
    return weightTotal ? total / weightTotal : null;
  }

  function soilValue(layers, name, divisor) {
    const value = weightedProfile(layers.get(name));
    return value === null ? null : value / divisor;
  }

  function textureGroup(sand, silt, clay) {
    if (![sand, silt, clay].every(Number.isFinite)) return null;
    if (clay >= 40) return "Clay-rich";
    if (sand >= 70) return "Sandy";
    if (silt >= 50) return "Silt-rich";
    return "Mixed texture";
  }

  function cropOptions(group) {
    return {
      Sandy: ["Watermelon", "Groundnut", "Mustard"],
      "Clay-rich": ["Rice", "Wheat", "Mustard"],
      "Silt-rich": ["Rice", "Wheat", "Maize"],
      "Mixed texture": ["Maize", "Wheat", "Mustard"]
    }[group] || [];
  }

  function formatValue(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "Not mapped";
  }

  function formatPercent(value, digits = 1) {
    return Number.isFinite(value) ? `${value.toFixed(digits)}%` : "Not mapped";
  }

  function renderReport(state, district, coordinate, layers) {
    const byName = new Map(layers.map(layer => [layer.name, layer]));
    const pH = soilValue(byName, "phh2o", 10);
    const sand = soilValue(byName, "sand", 10);
    const silt = soilValue(byName, "silt", 10);
    const clay = soilValue(byName, "clay", 10);
    const nitrogen = soilValue(byName, "nitrogen", 100);
    const organicCarbon = soilValue(byName, "soc", 10);
    const fieldCapacity = soilValue(byName, "wv0033", 10);
    const wiltingPoint = soilValue(byName, "wv1500", 10);
    const availableWater = Number.isFinite(fieldCapacity) && Number.isFinite(wiltingPoint)
      ? Math.max(0, fieldCapacity - wiltingPoint)
      : null;
    const group = textureGroup(sand, silt, clay);
    const crops = cropOptions(group);

    report.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = "Soil analysis report";
    const location = document.createElement("p");
    location.className = "soil-report-location";
    location.textContent = `${featureName(district)}, ${featureName(state)} · ${coordinate[1].toFixed(3)}° N, ${coordinate[0].toFixed(3)}° E`;
    const grid = document.createElement("div");
    grid.className = "soil-report-grid";
    const rows = [
      ["Broad texture group", group || "Not mapped"],
      ["Sand", formatPercent(sand)],
      ["Silt", formatPercent(silt)],
      ["Clay", formatPercent(clay)],
      ["pH (water)", formatValue(pH, 2)],
      ["Nitrogen", Number.isFinite(nitrogen) ? `${formatValue(nitrogen, 2)} g/kg` : "Not mapped"],
      ["Organic carbon", Number.isFinite(organicCarbon) ? `${formatValue(organicCarbon, 1)} g/kg` : "Not mapped"],
      ["Field capacity", Number.isFinite(fieldCapacity) ? `${formatValue(fieldCapacity)}% vol.` : "Not mapped"],
      ["Plant-available water", Number.isFinite(availableWater) ? `${formatValue(availableWater)}% vol.` : "Not mapped"],
      ["Phosphorus / potassium", "Not available from SoilGrids"]
    ];
    for (const [labelText, valueText] of rows) {
      const item = document.createElement("div");
      item.className = "soil-report-item";
      const label = document.createElement("small");
      label.textContent = labelText;
      const value = document.createElement("strong");
      value.textContent = valueText;
      item.append(label, value);
      grid.append(item);
    }
    const cropItem = document.createElement("div");
    cropItem.className = "soil-report-item";
    const cropLabel = document.createElement("small");
    cropLabel.textContent = "Texture-based crop starting options";
    const cropValue = document.createElement("strong");
    cropValue.textContent = crops.length ? crops.join(", ") : "Unavailable without mapped texture";
    cropItem.append(cropLabel, cropValue);
    grid.append(cropItem);
    const note = document.createElement("p");
    note.className = "soil-report-note";
    note.textContent = "Texture groups and crop options are broad screening guidance only. Values are weighted SoilGrids predictions for 0-30 cm at the district center; validate the actual plot with a Soil Health Card or laboratory before changing inputs.";
    report.append(title, location, grid, note);
    report.hidden = false;

    previewTexture.textContent = group
      ? `${group} · sand ${formatValue(sand)}%, clay ${formatValue(clay)}%`
      : "No grid value at this location";
    previewChemistry.textContent = Number.isFinite(pH)
      ? `pH ${formatValue(pH, 2)} · N ${Number.isFinite(nitrogen) ? `${formatValue(nitrogen, 2)} g/kg` : "N unavailable"}`
      : "Soil chemistry not mapped";
    previewCrops.textContent = Number.isFinite(availableWater)
      ? `${formatValue(availableWater)}% available water · ${crops.slice(0, 2).join(", ") || "crop match unavailable"}`
      : "Water capacity not mapped";
  }

  async function selectDistrict(district) {
    const geo = window.soilGeo;
    const coordinate = geo.geoCentroid(district);
    if (!coordinate.every(Number.isFinite)) throw new Error("Could not locate the district center.");
    status.textContent = "Loading soil profile...";
    report.hidden = true;
    try {
      const url = new URL("https://rest.isric.org/soilgrids/v2.0/properties/query");
      for (const property of SOIL_PROPERTIES) url.searchParams.append("property", property);
      for (const depth of ["0-5cm", "5-15cm", "15-30cm"]) url.searchParams.append("depth", depth);
      url.searchParams.set("lon", coordinate[0].toFixed(5));
      url.searchParams.set("lat", coordinate[1].toFixed(5));
      url.searchParams.set("value", "mean");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Soil service returned ${response.status}.`);
      const data = await response.json();
      const layers = data.properties?.layers || [];
      if (!layers.some(layer => layer.depths?.some(depth => Number.isFinite(depth.values?.mean)))) {
        throw new Error("No soil profile is mapped at this district center.");
      }
      renderReport(activeState, district, coordinate, layers);
      status.textContent = "Soil profile ready";
    } catch (error) {
      console.warn("Soil profile unavailable:", error);
      report.replaceChildren();
      const title = document.createElement("h3");
      title.textContent = "Soil profile unavailable";
      const message = document.createElement("p");
      message.className = "soil-report-note";
      message.textContent = "No SoilGrids values are available for this district center right now. Use a Soil Health Card or nearby soil-testing laboratory for pH, NPK, texture, and water-holding capacity.";
      report.append(title, message);
      report.hidden = false;
      previewTexture.textContent = "No grid value at this location";
      previewChemistry.textContent = "Use a soil test";
      previewCrops.textContent = "No mapped crop match";
      status.textContent = "Profile not mapped";
    }
  }

  async function selectFeature(feature) {
    status.textContent = "";
    try {
      if (activeState) await selectDistrict(feature);
      else await showDistricts(feature);
    } catch (error) {
      console.error("Soil map selection failed:", error);
      status.textContent = error.message || "Could not load this map level.";
    }
  }

  openButton.addEventListener("click", async () => {
    dialog.showModal();
    try {
      await showStates();
    } catch (error) {
      console.error("India state map failed to load:", error);
      status.textContent = "Map unavailable. Check your connection and try again.";
    }
  });
  closeButton.addEventListener("click", () => dialog.close());
  backButton.addEventListener("click", async () => {
    status.textContent = "";
    try {
      await showStates();
    } catch (error) {
      status.textContent = "Could not reload the state map.";
    }
  });
  districtSearch.addEventListener("input", updateChoiceSearch);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}