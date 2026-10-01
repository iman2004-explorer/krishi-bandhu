const FARM_GUIDES = [
  {
    category: "field-crops",
    title: "Rice and paddy planning",
    terms: "rice paddy kharif nursery transplant direct sow water irrigation drainage weeds blast stem borer harvest",
    guidance: "Choose a locally released variety and planting window for the district. Paddy may be nursery-transplanted or direct-seeded depending on water, labor, and weed pressure. Keep fields level, manage water without prolonged unnecessary flooding where local practice allows, and monitor weeds and diseases such as blast. Confirm seed rate, spacing, nutrient schedule, and safe control measures with the local KVK."
  },
  {
    category: "field-crops",
    title: "Wheat season and irrigation",
    terms: "wheat rabi sowing soil irrigation crown root initiation flowering rust weeds harvest grain",
    guidance: "Wheat is generally a cool-season Rabi crop. Timely sowing into a prepared, well-drained field helps establishment. Irrigation is especially important around crown-root development and later reproductive growth; adjust timing to rainfall, soil, and local advisories. Scout for weeds and rust, and use a locally recommended variety and nutrient plan based on a soil test."
  },
  {
    category: "field-crops",
    title: "Maize crop care",
    terms: "maize corn kharif zaid seed planting drainage irrigation nitrogen fall armyworm stemborer harvest",
    guidance: "Maize needs a well-drained seedbed and reliable moisture during establishment and flowering. Avoid waterlogging. Use locally adapted seed, rotate crops where possible, and scout young plants regularly for fall armyworm and stem-borer damage. Identify the pest before choosing a response; follow local integrated-pest-management guidance and pesticide labels."
  },
  {
    category: "field-crops",
    title: "Cotton integrated pest management",
    terms: "cotton kharif black soil irrigation bollworm pink bollworm sucking pests scouting harvest",
    guidance: "Cotton performs best with a locally suitable variety, well-drained soil, and a season matched to the district. Scout fields regularly for sucking pests and bollworms, use crop rotation and field sanitation, and follow resistance-management advice. Do not rely on calendar spraying; confirm pest identification and any treatment with local extension staff."
  },
  {
    category: "fruits",
    title: "Mango orchard basics",
    terms: "mango fruit orchard variety flowering pollination soil drainage irrigation pruning hopper anthracnose fruit fly harvest",
    guidance: "For mango, select a variety suited to local climate and market, use healthy planting material, and provide a well-drained site with space for the mature canopy. Avoid waterlogging and maintain orchard sanitation. Monitor flowering and fruit set for hopper or disease symptoms, and collect fallen fruit to reduce fruit-fly pressure. Pruning and treatment timing vary by cultivar and region, so check the local horticulture package."
  },
  {
    category: "fruits",
    title: "Banana establishment and harvest",
    terms: "banana fruit tissue culture planting drainage irrigation wind sucker pseudostem bunch harvest ripening",
    guidance: "Banana needs fertile, well-drained soil, steady moisture, and protection from strong wind. Start with healthy, true-to-type planting material; manage suckers and support heavy bunches as locally advised. Avoid standing water around roots and remove diseased plant parts using clean tools. Harvest maturity depends on cultivar and whether fruit is for nearby sale or transport."
  },
  {
    category: "fruits",
    title: "Guava orchard and fruit fly",
    terms: "guava fruit orchard pruning irrigation drainage fruit fly wilt harvesting bagging sanitation",
    guidance: "Guava tolerates a range of conditions but benefits from a sunny site with drainage and a locally suited variety. Keep an orchard floor clean, prune for manageable airflow, and monitor wilt and fruit-fly damage. Remove and dispose of infested fallen fruit; any trapping or bagging method should follow local horticulture guidance. Avoid assuming the same pruning or harvest calendar fits every region."
  },
  {
    category: "fruits",
    title: "Citrus orchard health",
    terms: "citrus orange lemon mandarin fruit rootstock drainage irrigation canker greening nutrition harvest",
    guidance: "Citrus needs healthy, true-to-type nursery plants, good drainage, and irrigation matched to soil and weather. Inspect trees for leaf yellowing, canker-like lesions, dieback, or abnormal fruit and seek a local diagnosis before treatment. Use soil and leaf analysis for nutrient decisions. Rootstock, variety, disease pressure, and harvest maturity are region-specific."
  },
  {
    category: "flowers",
    title: "Marigold production",
    terms: "marigold flower nursery transplant pinching drainage irrigation flower harvest garland pests",
    guidance: "Marigold can be raised from healthy seed or nursery seedlings, with planting dates selected for the local flowering and market season. Use a sunny, well-drained bed, avoid excess water around roots, and remove weeds early. Pinching may encourage branching in suitable types. Harvest fully developed flowers at the stage preferred by the buyer, and keep them shaded after picking."
  },
  {
    category: "flowers",
    title: "Rose care and cut flowers",
    terms: "rose flower garden cut flower pruning drainage irrigation black spot mildew aphids harvest",
    guidance: "Roses need a locally adapted variety, sunlight, drainage, and airflow through the canopy. Pruning timing depends on climate and rose type. Water near the root zone where possible and avoid keeping foliage wet for long periods. Monitor black spot, powdery mildew, and aphids; identify the problem before treatment. Cut-flower stage and post-harvest handling depend on the market and cultivar."
  },
  {
    category: "flowers",
    title: "Chrysanthemum season planning",
    terms: "chrysanthemum flower photoperiod short day nursery pinching staking drainage rust harvest",
    guidance: "Chrysanthemum flowering responds to variety and day length, so select planting material and schedules for the local season and target market date. Provide drainage, even moisture, and support for tall stems. Pinching is used in some production systems to shape plants, but timing varies by cultivar. Watch for leaf-spot or rust symptoms and confirm diagnosis locally."
  },
  {
    category: "flowers",
    title: "Jasmine flower harvest",
    terms: "jasmine flower buds fragrance pruning irrigation drainage harvest morning garland",
    guidance: "Jasmine production depends strongly on species, variety, and local climate. Use healthy planting material, maintain a drained root zone, and prune according to the regional flowering cycle. Pick buds at the stage requested by the local buyer, handle gently, and keep harvested flowers cool and shaded. Ask local horticulture extension staff about cultivar-specific pruning and nutrient schedules."
  },
  {
    category: "spices",
    title: "Turmeric planting and rhizomes",
    terms: "turmeric spice rhizome seed planting monsoon shade drainage irrigation rhizome rot harvest curing",
    guidance: "Turmeric is propagated from healthy rhizomes and generally needs warm, moist growing conditions with good drainage. Prepare healthy seed rhizomes and avoid fields with a history of rhizome rot where possible. Mulching and water management are common practices, but planting dates and nutrient schedules vary by state and variety. Harvest and curing should follow the local buyer or processing standard."
  },
  {
    category: "spices",
    title: "Ginger drainage and disease",
    terms: "ginger spice rhizome seed shade drainage irrigation rhizome rot bacterial wilt harvest",
    guidance: "Ginger prefers warm, humid conditions and loose, well-drained soil; waterlogging can increase rhizome-rot risk. Use healthy planting rhizomes, rotate away from diseased plots, and avoid moving contaminated soil or planting material. Inspect weak or yellowing plants and obtain a diagnosis before treating. Harvest timing depends on whether ginger is sold fresh or mature."
  },
  {
    category: "spices",
    title: "Chilli crop management",
    terms: "chilli chili spice nursery transplant irrigation thrips mites fruit borer anthracnose harvest drying",
    guidance: "Chilli needs healthy seedlings, a well-drained field, and moisture without prolonged waterlogging. Scout leaves and flowers for thrips, mites, and borer damage; also watch for fruit rot. Remove affected material where appropriate and use integrated pest management. Do not apply a pesticide based only on a chatbot description; confirm the pest and follow the registered product label and local extension guidance."
  },
  {
    category: "spices",
    title: "Coriander seed and leaf crops",
    terms: "coriander spice dhania seed leaf sowing cool season bolting irrigation harvest drying",
    guidance: "Coriander may be grown for leaves or seeds, and the goal changes variety choice, spacing, and harvest stage. It is commonly suited to cooler-season planting; heat can cause early bolting. Use a fine seedbed, maintain moisture for establishment, and avoid waterlogging. For seed, allow the crop to mature and dry appropriately before threshing and storage."
  },
  {
    category: "general",
    title: "Soil tests and nutrient planning",
    terms: "soil test nutrients nitrogen phosphorus potassium ph fertilizer organic matter sample",
    guidance: "Base fertilizer decisions on a representative soil test, crop, expected yield, and local recommendations. A soil test can guide pH and nutrient management; do not infer a fertilizer dose from crop name alone. Keep records of inputs and results. Ask a soil-testing laboratory or KVK how to sample the field and interpret the report."
  },
  {
    category: "general",
    title: "Farm economics and market prices",
    terms: "price market profit budget costs investment revenue mandis market benchmark transport storage",
    guidance: "Farm profit depends on saleable yield, the price actually received, input and labor costs, transport, storage losses, and timing. Treat app market prices and cost splits as illustrative unless updated with a current local mandi quote and farm receipts. Compare more than one buyer and keep records by crop and season."
  },
  {
    category: "general",
    title: "Pest and disease safety",
    terms: "pest disease identify diagnosis pesticide chemical dose safety label integrated management",
    guidance: "A text description alone may not identify a pest or plant disease reliably. Check several plants, note crop stage and recent weather, and use clear photos or a local expert diagnosis. Prefer prevention and integrated pest management. Any pesticide must be registered for the crop and pest, used exactly as its label and local regulations state, with required protective equipment and pre-harvest interval."
  }
];

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function retrieveFarmKnowledge({ topic, question, farm }, limit = 3) {
  const queryTerms = tokenize(`${topic} ${question} ${farm.season} ${farm.soil} ${farm.location}`);
  const documentFrequency = new Map();
  for (const term of new Set(queryTerms)) {
    documentFrequency.set(term, FARM_GUIDES.filter(guide =>
      tokenize(`${guide.category} ${guide.title} ${guide.terms}`).includes(term)
    ).length);
  }

  const scopedGuides = topic === "general"
    ? FARM_GUIDES
    : FARM_GUIDES.filter(guide => guide.category === topic || guide.category === "general");
  const ranked = scopedGuides.map(guide => {
    const documentTerms = tokenize(`${guide.category} ${guide.title} ${guide.terms}`);
    const termCounts = new Map();
    for (const term of documentTerms) termCounts.set(term, (termCounts.get(term) || 0) + 1);
    const score = queryTerms.reduce((total, term) => {
      const frequency = termCounts.get(term) || 0;
      if (!frequency) return total;
      const documentCount = documentFrequency.get(term) || 0;
      const inverseFrequency = Math.log(1 + (FARM_GUIDES.length - documentCount + 0.5) / (documentCount + 0.5));
      return total + inverseFrequency * (frequency * 2.2) / (frequency + 1.2);
    }, guide.category === topic || guide.category === "general" ? 1 : 0);
    return { ...guide, score };
  });

  const matches = ranked.filter(guide => guide.score > 1 && (guide.category === topic || topic === "general"))
    .sort((left, right) => right.score - left.score);
  const fallback = ranked
    .filter(guide => guide.category === topic || guide.category === "general")
    .sort((left, right) => right.score - left.score);
  return (matches.length ? matches : fallback).slice(0, limit);
}