const CROP_PROFILES = [
  {
    name: "Paddy",
    seasons: ["Kharif"],
    soils: ["Alluvial", "Clay"],
    minTemp: 22,
    maxTemp: 35,
    waterDemand: 1,
    growthDays: 120,
    note: "Paddy is listed for Kharif on alluvial or clay soils and has high water demand."
  },
  {
    name: "Wheat",
    seasons: ["Rabi"],
    soils: ["Alluvial", "Loamy", "Clay", "Black soil"],
    minTemp: 10,
    maxTemp: 25,
    waterDemand: 0.5,
    growthDays: 130,
    note: "Wheat is listed for the cooler Rabi season and well-drained loamy soils."
  },
  {
    name: "Maize",
    seasons: ["Zaid"],
    soils: ["Alluvial", "Loamy", "Clay", "Black soil"],
    minTemp: 18,
    maxTemp: 32,
    waterDemand: 0.5,
    growthDays: 100,
    note: "Maize is listed as adaptable to several soil types with moderate warmth and water."
  },
  {
    name: "Mustard",
    seasons: ["Rabi"],
    soils: ["Sandy", "Loamy"],
    minTemp: 8,
    maxTemp: 24,
    waterDemand: 0.2,
    growthDays: 110,
    note: "Mustard is listed as a low-water Rabi option for cooler conditions."
  },
  {
    name: "Cotton",
    seasons: ["Kharif"],
    soils: ["Black soil", "Alluvial"],
    minTemp: 20,
    maxTemp: 35,
    waterDemand: 0.7,
    growthDays: 165,
    note: "Cotton is listed for warm conditions and deep black or alluvial soils."
  },
  {
    name: "Watermelon",
    seasons: ["Zaid"],
    soils: ["Sandy"],
    minTemp: 20,
    maxTemp: 35,
    waterDemand: 0.5,
    growthDays: 90,
    note: "Watermelon is listed for sandy soils in the warm Zaid season."
  }
];

const FEATURE_COUNT = 6;

function temperatureFit(profile, temperature) {
  const midpoint = (profile.minTemp + profile.maxTemp) / 2;
  const spread = (profile.maxTemp - profile.minTemp) / 2 + 3;
  return Math.exp(-0.5 * ((temperature - midpoint) / spread) ** 2);
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-10) continue;
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  return augmented.map(row => row[size] || 0);
}

function fitYieldRegression(cropDatabase) {
  const featureSize = 2;
  const rows = CROP_PROFILES.map(profile => {
    const crop = cropDatabase[profile.name];
    return {
      features: [1, crop.yieldPerAcre / 75],
      target: crop.yieldPerAcre
    };
  });
  const matrix = Array.from({ length: featureSize }, () => Array(featureSize).fill(0));
  const values = Array(featureSize).fill(0);

  for (const row of rows) {
    for (let left = 0; left < featureSize; left += 1) {
      values[left] += row.features[left] * row.target;
      for (let right = 0; right < featureSize; right += 1) {
        matrix[left][right] += row.features[left] * row.features[right];
      }
    }
  }

  matrix[1][1] += 1e-6;
  return solveLinearSystem(matrix, values);
}

function predictYield(crop, coefficients) {
  const features = [1, crop.yieldPerAcre / 75];
  const estimate = features.reduce((sum, feature, index) => sum + feature * coefficients[index], 0);
  return Math.max(0, estimate);
}

function principalComponents(rows, componentCount = 2) {
  const means = Array.from({ length: FEATURE_COUNT }, (_, index) =>
    rows.reduce((sum, row) => sum + row[index], 0) / rows.length
  );
  const scales = means.map((_, index) => {
    const variance = rows.reduce((sum, row) => sum + (row[index] - means[index]) ** 2, 0) / rows.length;
    return Math.sqrt(variance) || 1;
  });
  const standardized = rows.map(row => row.map((value, index) => (value - means[index]) / scales[index]));
  const covariance = Array.from({ length: FEATURE_COUNT }, (_, row) =>
    Array.from({ length: FEATURE_COUNT }, (_, column) =>
      standardized.reduce((sum, values) => sum + values[row] * values[column], 0) / standardized.length
    )
  );
  const residual = covariance.map(row => [...row]);
  const components = [];

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
    let vector = Array.from({ length: FEATURE_COUNT }, (_, index) => 1 / (index + 1));
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const next = residual.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
      const length = Math.hypot(...next);
      if (length < 1e-10) break;
      vector = next.map(value => value / length);
    }

    const eigenvalue = vector.reduce((sum, value, row) =>
      sum + value * residual[row].reduce((inner, covarianceValue, column) => inner + covarianceValue * vector[column], 0), 0
    );
    if (eigenvalue < 1e-10) break;
    components.push(vector);
    for (let row = 0; row < FEATURE_COUNT; row += 1) {
      for (let column = 0; column < FEATURE_COUNT; column += 1) {
        residual[row][column] -= eigenvalue * vector[row] * vector[column];
      }
    }
  }

  return {
    project: values => {
      const standardizedValues = values.map((value, index) => (value - means[index]) / scales[index]);
      return components.map(component => component.reduce((sum, value, index) => sum + value * standardizedValues[index], 0));
    }
  };
}

function retrieveEvidence(farm) {
  const temperatureWord = farm.temperature < 18 ? "cool" : farm.temperature > 28 ? "warm" : "moderate";
  const query = `${farm.season} ${farm.soil} ${temperatureWord}`.toLowerCase().match(/[a-z]+/g) || [];
  const documents = CROP_PROFILES.map(profile => {
    const climate = profile.maxTemp >= 30 ? "warm" : "cool";
    return {
      profile,
      tokens: `${profile.name} ${profile.seasons.join(" ")} ${profile.soils.join(" ")} ${profile.note} ${climate}`
        .toLowerCase().match(/[a-z]+/g) || []
    };
  });
  const documentFrequency = new Map();
  for (const term of new Set(query)) {
    documentFrequency.set(term, documents.filter(document => document.tokens.includes(term)).length);
  }

  return documents.map(document => {
    const score = query.reduce((total, term) => {
      const frequency = document.tokens.filter(token => token === term).length;
      if (!frequency) return total;
      const inverseFrequency = Math.log(1 + (documents.length - (documentFrequency.get(term) || 0) + 0.5) /
        ((documentFrequency.get(term) || 0) + 0.5));
      return total + inverseFrequency * (frequency * 2.2) / (frequency + 1.2);
    }, 0);
    return { profile: document.profile, score };
  });
}

export function recommendFarmCrops({ season, soil, temperature = 22 }, cropDatabase) {
  const farm = {
    season,
    soil,
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 22
  };
  const regression = fitYieldRegression(cropDatabase);
  const evidence = retrieveEvidence(farm);
  const featureRows = CROP_PROFILES.map(profile => {
    const crop = cropDatabase[profile.name];
    return [
      profile.seasons.includes(farm.season) ? 1 : 0,
      profile.soils.includes(farm.soil) ? 1 : 0,
      temperatureFit(profile, farm.temperature),
      crop.yieldPerAcre / 75,
      crop.price / 6600,
      profile.waterDemand
    ];
  });
  const pca = principalComponents(featureRows);
  const idealPoint = pca.project([1, 1, 1, 0.5, 0.5, 0.5]);
  const projectedRows = featureRows.map(row => pca.project(row));
  const pcaScores = projectedRows.map(point => {
    const distance = Math.hypot(...point.map((value, index) => value - idealPoint[index]));
    return 1 / (1 + distance);
  });
  const evidenceScores = evidence.map(item => item.score);
  const maxEvidence = Math.max(...evidenceScores, 1e-8);

  const candidates = CROP_PROFILES.map((profile, index) => {
    const crop = cropDatabase[profile.name];
    const seasonLikelihood = profile.seasons.includes(farm.season) ? 0.82 : 0.08;
    const soilLikelihood = profile.soils.includes(farm.soil) ? 0.86 : 0.14;
    const climateLikelihood = Math.max(0.05, temperatureFit(profile, farm.temperature));
    const posterior = seasonLikelihood * soilLikelihood * climateLikelihood;
    const retrievalScore = evidence[index].score / maxEvidence;
    return {
      cropName: profile.name,
      crop,
      estimatedYield: predictYield(crop, regression),
      posterior,
      pcaScore: pcaScores[index],
      retrievalScore,
      evidence: profile.note,
      score: 0
    };
  });

  const posteriorTotal = candidates.reduce((sum, candidate) => sum + candidate.posterior, 0) || 1;
  for (const candidate of candidates) {
    candidate.posterior /= posteriorTotal;
    candidate.score = 0.6 * candidate.posterior + 0.1 * candidate.pcaScore + 0.3 * candidate.retrievalScore;
  }
  candidates.sort((left, right) => right.score - left.score);

  return {
    recommendation: candidates[0],
    alternatives: candidates.slice(1, 3),
    dataNote: "Preliminary ranking: six app benchmark records, not local field-trial data."
  };
}