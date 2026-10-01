/**
 * Bengali language support for Krishi Bandhu chatbot.
 * Detects Bengali-in-Latin (Banglish) queries and translates them
 * to English so the existing English knowledge base and model work.
 *
 * Also detects actual Bengali script (U+0980–U+09FF) for future
 * translation expansion.
 */

const BENGALI_UNICODE_START = 0x0980;
const BENGALI_UNICODE_END = 0x09FF;

// --- Transliteration dictionary: Latin-script Bengali → English ---
const BENGALI_TO_ENGLISH = {
  // Common conversation words
  amar: 'my', amader: 'our', apnar: 'your', apni: 'you', tumi: 'you',
  'ki': 'what', keno: 'why', kokhon: 'when', kibhabe: 'how', kivabe: 'how',
  korbo: 'should do', korte: 'to do', korun: 'do', chai: 'want', lagbe: 'need',
  ache: 'have', nei: 'not available', hocche: 'is happening', hochhe: 'is happening',
  jacche: 'is becoming', lagche: 'seems', dekhacche: 'shows', legeche: 'affected',
  // Farming questions and problems
  dhan: 'rice paddy', fasol: 'crop', chash: 'cultivation', jomi: 'field',
  gache: 'plant', gachhe: 'plant', pata: 'leaf', poka: 'pest insect',
  ful: 'flower', fuler: 'flower', phul: 'flower', phuler: 'flower', phooler: 'flower',
  rog: 'disease', shukno: 'dry', shukiye: 'drying',
  pocha: 'rot', sar: 'fertilizer',
  dam: 'price', taka: 'money', khoroch: 'cost', lav: 'profit', labh: 'profit',
  brishti: 'rain', abohawa: 'weather', bij: 'seed', folon: 'yield',
  // Crops
  paddy: 'rice', padder: 'rice', dhani: 'rice',
  gam: 'wheat', goru: 'wheat', godhum: 'wheat',
  maiz: 'maize', makai: 'maize',
  sarisha: 'mustard', shorisha: 'mustard', sarson: 'mustard',
  kapor: 'cotton', kapas: 'cotton',
  tarmul: 'watermelon', tarbuj: 'watermelon',
  ada: 'ginger', adaa: 'ginger',
  haldi: 'turmeric', holud: 'yellow turmeric',
  morich: 'chilli', lanka: 'chilli',
  dhania: 'coriander', dhoneya: 'coriander',
  aam: 'mango', am: 'mango',
  kola: 'banana', kol: 'banana',
  peyara: 'guava',
  gulap: 'rose', gulab: 'rose',
  marigold: 'marigold', genda: 'marigold',
  jui: 'jasmine', chameli: 'jasmine',
  // Seasons
  kharif: 'kharif', rabi: 'rabi', zaid: 'zaid',
  shad: 'season', somash: 'season', somsher: 'season', kal: 'season',
  // Soil
  mati: 'soil', matir: 'soil', mattir: 'soil',
  jatir: 'type', jati: 'type', jat: 'type',
  alluvial: 'alluvial', loamy: 'loamy', clay: 'clay', sandy: 'sandy',
  black: 'black', kalo: 'black', kali: 'black',
  bali: 'alluvial', baluk: 'sandy', shyle: 'loamy',
  // Water
  jol: 'water', pani: 'water', joler: 'water', panir: 'water',
  chheda: 'requirement', chheye: 'touch', chhoye: 'touch',
  jolchheda: 'water requirement',
  // Questions / verbs
  kemon: 'how', kotha: 'question', 'kotha bol': 'tell me',
  bol: 'say', bolo: 'tell', jani: 'know', 'jani na': 'do not know',
  hoy: 'happens', holo: 'became', hobe: 'will be',
  hote: 'can be', 'hote pare': 'can be', 'hote chhe': 'can be',
  // Adjectives
  bhalo: 'good', bro: 'bad', besh: 'very', beshi: 'more', kom: 'less',
  sobcheye: 'most', shobcheye: 'most', shob: 'all', shobai: 'everyone',
  'shobcheye bhalo': 'best', 'shobcheye besh': 'most', 'shobcheye kom': 'least',
  // Verbs
  shomvobhon: 'suitable', shomvobhota: 'suitability',
  'shomvobhon holo': 'is suitable', 'shomvobhon holo na': 'is not suitable',
  'shomvobhon hobe': 'will be suitable',
  'shomvobhon hote pare': 'can be suitable',
  'shomvobhon hote chhe': 'can be suitable',
  'shomvobhon holo kemon': 'how is it suitable',
  // Common phrases
  bhaiya: 'sir', dada: 'sir', bhai: 'brother',
  fason: 'crop', 'fason kharif': 'kharif crop', 'fason rabi': 'rabi crop', 'fason zaid': 'zaid crop',
  bot: 'plant', gach: 'plant', gacher: 'plant',
  phool: 'flower', phaler: 'fruit', phal: 'fruit',
  'shad eke': 'at the same time', 'shob kotha': 'all questions',
  shobutir: 'all of them',
  'shobcheye bhalo holo': 'became best', 'shobcheye besh holo': 'became most',
  'shobcheye kom holo': 'became least',
  'shobcheye bhalo holo na': 'did not become best',
  'shobcheye besh holo na': 'did not become most',
  'shobcheye kom holo na': 'did not become least',
  'shobcheye bhalo holo kemon': 'how did it become best',
  'shobcheye besh holo kemon': 'how did it become most',
  'shobcheye kom holo kemon': 'how did it become least',
};

// Multi-word pattern translations (regex → English)
const BENGALI_PATTERNS = [
  { pattern: /kemon\s+hoy\?/i, translation: 'how is it?' },
  { pattern: /kemon\s+holo\?/i, translation: 'how did it become?' },
  { pattern: /kotha\s+bol/i, translation: 'tell me' },
  { pattern: /bolo\s+kotha/i, translation: 'tell me about' },
  { pattern: /shomvobhon\s+holo\?/i, translation: 'is it suitable?' },
  { pattern: /shomvobhon\s+holo\s+na/i, translation: 'is it not suitable?' },
  { pattern: /shomvobhon\s+hobe/i, translation: 'will it be suitable?' },
  { pattern: /shomvobhon\s+hote\s+pare/i, translation: 'can it be suitable?' },
  { pattern: /shomvobhon\s+hote\s+chhe/i, translation: 'can it be suitable?' },
  { pattern: /fason\s+kharif/i, translation: 'kharif crop' },
  { pattern: /fason\s+rabi/i, translation: 'rabi crop' },
  { pattern: /fason\s+zaid/i, translation: 'zaid crop' },
  { pattern: /matir\s+jatir/i, translation: 'soil type' },
  { pattern: /jol\s+chheda/i, translation: 'water requirement' },
  { pattern: /shobcheye\s+bhalo/i, translation: 'best' },
  { pattern: /shobcheye\s+besh/i, translation: 'most' },
  { pattern: /shobcheye\s+kom/i, translation: 'least' },
  { pattern: /shobcheye\s+bhalo\s+holo/i, translation: 'became best' },
  { pattern: /shobcheye\s+besh\s+holo/i, translation: 'became most' },
  { pattern: /shobcheye\s+kom\s+holo/i, translation: 'became least' },
  { pattern: /shobcheye\s+bhalo\s+holo\s+kemon/i, translation: 'how did it become best' },
  { pattern: /shobcheye\s+besh\s+holo\s+kemon/i, translation: 'how did it become most' },
  { pattern: /shobcheye\s+kom\s+holo\s+kemon/i, translation: 'how did it become least' },
];

/**
 * Check if text contains Bengali script characters (U+0980–U+09FF).
 */
export function containsBengaliScript(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= BENGALI_UNICODE_START && code <= BENGALI_UNICODE_END) return true;
  }
  return false;
}

/**
 * Detect if text contains Bengali words written in Latin script.
 * Returns a confidence score 0–1.
 */
function detectBengaliInLatin(text) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  if (words.length === 0) return 0;
  const indicators = new Set([
    'amar','amader','apnar','apni','tumi','ki','keno','kokhon','kibhabe','kivabe',
    'korbo','korte','korun','chai','lagbe','ache','nei','hocche','hochhe','jacche',
    'lagche','dekhacche','legeche','dhan','fasol','chash','jomi','gach','gacher',
    'gache','gachhe','pata','poka','rog','holud','shukno','shukiye','pocha','sar','dam','taka','khoroch',
    'lav','labh','brishti','abohawa','bij','folon','ful','fuler','phul','phuler','phool','phooler',
    'kemon','holo','hoy','bolo','jani','hesh','shobcheye','shob',
    'bhalo','buro','besh','beshi','kom','shomvobhon','fason',
    'bot','gach','phool','phal','mati','jol','pani','shad',
    'somash','kharif','rabi','zaid','alluvial','loamy','clay',
    'sandy','black','kalo','chheda','chheye','jatir','jati',
    'hote','hobe','holo','na','pare','bhaiya','dada','bhai',
    'shorisha','sarisha','kapor','tarmul','ada','haldi','morich',
    'dhania','aam','kola','peyara','gulap','genda','jui','gam',
    'goru','maiz','makai','sarson','kapas','tarbuj','holud',
    'lanka','dhoneya','am','kol','gulab','chameli','godhum',
    'padder','dhani','joler','panir','mattir','jat','bali',
    'baluk','shyle','somsher','kal','shobai','shobutir',
    'shomvobhota','shomvobhonholo','shomvobhonholona',
    'shomvobhonhobe','shomvobhonhotepare','shomvobhonhotechhe',
    'shomvobhonholokemon','fasonkharif','fasonrabi','fasonzaid',
    'matirjatir','jolchheda','shobcheyebhalo','shobcheyebesh',
    'shobcheyekom','shobcheyebhaloholo','shobcheyebeshholo',
    'shobcheyekomholo','shobcheyebhaloholokemon',
    'shobcheyebeshholokemon','shobcheyekomholokemon',
  ]);
  let count = 0;
  for (const w of words) { if (indicators.has(w)) count++; }
  const ratio = count / words.length;
  return ratio > 0.25 ? ratio : 0;
}

/**
 * Translate Bengali-in-Latin text to English.
 * Multi-word patterns are applied first (longest first), then single words.
 */
function translateBengaliToEnglish(text) {
  let out = text.toLowerCase();
  const sorted = [...BENGALI_PATTERNS].sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  for (const { pattern, translation } of sorted) out = out.replace(pattern, translation);
  return out.replace(/[a-z]+/g, word => BENGALI_TO_ENGLISH[word] || word);
}

/**
 * Main entry point. Returns { original, translated, isBengali, isScript, confidence }.
 */
export function processQuery(query) {
  if (containsBengaliScript(query)) {
    return { original: query, translated: query, isBengali: true, isScript: true, confidence: 1.0 };
  }
  const score = detectBengaliInLatin(query);
  if (score > 0) {
    return { original: query, translated: translateBengaliToEnglish(query), isBengali: true, isScript: false, confidence: score };
  }
  return { original: query, translated: query, isBengali: false, isScript: false, confidence: 0 };
}

export function resolveChatTopic(query, selectedTopic) {
  const flowerQuestion = /\b(?:flowers?|ful(?:er)?|phul(?:er)?|phool(?:er)?)\b|ফুল/u.test(query);
  return flowerQuestion ? 'flowers' : selectedTopic;
}

/**
 * Human-readable language label.
 */
export function getLanguageLabel(isBengali, isScript) {
  if (isScript) return 'বাংলা (Bengali script)';
  if (isBengali) return 'বাংলা (Bengali-Latin)';
  return 'English';
}
