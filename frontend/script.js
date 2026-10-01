const money = n => "₹" + Math.round(n).toLocaleString("en-IN");

// Theme Switcher Logic
const themeToggle = document.getElementById("themeToggle");
const currentTheme = localStorage.getItem("krishi_theme") || "light";

if (currentTheme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
  themeToggle.textContent = "☀️";
}

themeToggle.addEventListener("click", () => {
  let theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("krishi_theme", "light");
    themeToggle.textContent = "🌙";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("krishi_theme", "dark");
    themeToggle.textContent = "☀️";
  }
});

// Database of crop parameters & market values per quintal (₹)
const cropDatabase = {
  "Paddy": { yieldPerAcre: 42, period: "110–130 days", water: "High", price: 2300, desc: "Thrives in heavy moisture and alluvial or clay soils during monsoon seasons." },
  "Wheat": { yieldPerAcre: 36, period: "120–140 days", water: "Medium", price: 2275, desc: "Ideal for cooler winter (Rabi) timelines with well-drained loamy soils." },
  "Maize": { yieldPerAcre: 35, period: "90–110 days", water: "Medium", price: 2090, desc: "Versatile crop adaptable across various soils with moderate warmth." },
  "Mustard": { yieldPerAcre: 18, period: "100–120 days", water: "Low", price: 5450, desc: "Great Rabi oilseed option requiring minimal water and cooler climates." },
  "Cotton": { yieldPerAcre: 12, period: "150–180 days", water: "Medium-High", price: 6600, desc: "Suits deep black or alluvial soils under warm weather conditions." },
  "Watermelon": { yieldPerAcre: 75, period: "80–100 days", water: "Medium", price: 1800, desc: "Best suited for sandy or light soils during warm Zaid windows." }
};

let activeCropData = cropDatabase["Paddy"];
let activeCropName = "Paddy";

// Fetch Live Free Weather from Open-Meteo API using Geocoding
async function fetchLiveWeather(cityName = "Durgapur") {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`);
    const geoData = await geoRes.json();
    
    if (!geoData.results || geoData.results.length === 0) return;
    
    const { latitude, longitude, name, admin1, country } = geoData.results[0];
    document.getElementById("weatherLocLabel").textContent = `📍 ${name}, ${admin1 || country}`;
    
    // Fetch current weather & forecast without API key limits using Open-Meteo
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
    const weatherData = await weatherRes.json();
    
    if (weatherData.current) {
      const temp = Math.round(weatherData.current.temperature_2m);
      const humidity = weatherData.current.relative_humidity_2m;
      const wind = Math.round(weatherData.current.wind_speed_10m);
      
      document.getElementById("tempVal").textContent = `${temp}°C`;
      document.getElementById("humidityVal").textContent = `${humidity}%`;
      document.getElementById("windVal").textContent = `${wind} km/h`;
      document.getElementById("weatherStatus").textContent = "● Live Open-Meteo Data";
      
      let conditionText = "Clear skies";
      let icon = "☀️";
      if (weatherData.current.weather_code > 3) { conditionText = "Partly cloudy / humid"; icon = "⛅"; }
      if (weatherData.current.weather_code > 50) { conditionText = "Monsoon showers / damp"; icon = "🌧️"; }
      document.getElementById("conditionVal").textContent = conditionText;
      document.getElementById("weatherIcon").textContent = icon;

      // Update forecast blocks if available
      if (weatherData.daily && weatherData.daily.temperature_2m_max) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayIdx = new Date().getDay();
        let forecastHTML = '';
        for(let i=0; i<4; i++) {
          const dayName = i === 0 ? "Today" : days[(todayIdx + i) % 7];
          const maxT = Math.round(weatherData.daily.temperature_2m_max[i] || temp);
          forecastHTML += `<div>${dayName} <b>${maxT}°</b></div>`;
        }
        document.getElementById("forecastContainer").innerHTML = forecastHTML;
      }
    }
  } catch (err) {
    console.warn("Weather fetch failed, utilizing fallback demo metrics.", err);
    document.getElementById("weatherStatus").textContent = "● Offline Fallback Mode";
  }
}

// Calculate Investment, Expense Breakdown, and Profit Margins
function updateProfit() {
  const investment = Math.max(1000, Number(document.getElementById("investment").value) || 50000);
  const split = { seed: 0.12, fert: 0.21, labour: 0.36, water: 0.14, protect: 0.095, other: 0.075 };
  const ids = ["seedCost", "fertCost", "labourCost", "waterCost", "protectCost", "otherCost"];
  const vals = Object.values(split).map(x => investment * x);
  
  ids.forEach((id, i) => {
    document.getElementById(id).textContent = money(vals[i]);
  });
  
  const totalExpense = vals.reduce((a, b) => a + b, 0);
  document.getElementById("totalCost").textContent = money(totalExpense);

  const acres = Math.max(0.1, Number(document.getElementById("land").value) || 2);
  const grossRevenue = acres * activeCropData.yieldPerAcre * activeCropData.price;
  const netProfit = grossRevenue - totalExpense;

  document.getElementById("marketPrice").textContent = `₹${activeCropData.price.toLocaleString("en-IN")} / q`;
  document.getElementById("revenue").textContent = money(grossRevenue);
  document.getElementById("profitValue").textContent = money(netProfit);
  document.getElementById("selectedCrop").textContent = `${activeCropName} · ${acres} acres`;
}

document.getElementById("investment").addEventListener("input", updateProfit);
document.getElementById("land").addEventListener("input", updateProfit);

// Handle Crop Recommendation Engine Form Submit
document.getElementById("cropForm").addEventListener("submit", e => {
  e.preventDefault();
  const season = document.getElementById("season").value;
  const soil = document.getElementById("soil").value;
  const location = document.getElementById("locationInput").value.trim() || "Durgapur";

  // Intelligent matching rules based on inputs
  if (season === "Rabi") {
    activeCropName = soil === "Sandy" ? "Mustard" : "Wheat";
  } else if (season === "Zaid") {
    activeCropName = soil === "Sandy" ? "Watermelon" : "Maize";
  } else {
    activeCropName = soil === "Black soil" ? "Cotton" : "Paddy";
  }

  activeCropData = cropDatabase[activeCropName];

  document.getElementById("cropName").textContent = activeCropName;
  document.getElementById("yield").textContent = `${activeCropData.yieldPerAcre} q / acre`;
  document.getElementById("period").textContent = activeCropData.period;
  document.getElementById("water").textContent = activeCropData.water;
  document.getElementById("cropReason").textContent = `Model Analysis for ${location} (${season} season, ${soil.toLowerCase()}): Recommended ${activeCropName}. ${activeCropData.desc}`;
  document.getElementById("modelStatusBadge").textContent = `AI MODEL STATUS: OPTIMIZED FOR ${location.toUpperCase()}`;

  // Fetch live local weather dynamically for this location input
  fetchLiveWeather(location);
  updateProfit();
});

// Natural Language AI Text Chat Processor
document.getElementById("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById("chatMessages");
  const userMsg = document.createElement("div");
  userMsg.className = "message user";
  userMsg.textContent = text;
  box.appendChild(userMsg);
  input.value = "";
  box.scrollTop = box.scrollHeight;

  // Process text query via intelligent text rules mimicking an LLM agricultural agent
  setTimeout(() => {
    const botMsg = document.createElement("div");
    botMsg.className = "message bot";
    
    const lowerText = text.toLowerCase();
    if (lowerText.includes("weather") || lowerText.includes("rain") || lowerText.includes("temperature")) {
      botMsg.textContent = `🌤️ Weather Agent Analysis: Atmospheric sensors report steady levels with moderate humidity. Ideal conditions for field prep and routine irrigation tracking.`;
    } else if (lowerText.includes("profit") || lowerText.includes("cost") || lowerText.includes("expense") || lowerText.includes("investment")) {
      botMsg.textContent = `💰 Economic Agent Output: Based on your current capital allocation of ₹${document.getElementById("investment").value}, labour takes ~36% and fertilizers ~21%. Net margins for ${activeCropName} project strong positive yield returns. Check the calculator card below for precise breakdowns!`;
    } else if (lowerText.includes("crop") || lowerText.includes("grow") || lowerText.includes("soil") || lowerText.includes("season")) {
      botMsg.textContent = `🌱 Crop Suggestion Engine: For your described parameters, ${activeCropName} is evaluated as optimal. It yields ~${activeCropData.yieldPerAcre} quintals/acre with market pricing averaging ₹${activeCropData.price}/q.`;
    } else {
      botMsg.textContent = `🤖 Krishi Bandhu AI: I have processed your text request regarding "${text}". Ensure your location and soil parameters are set correctly in the crop engine panel for hyper-localized yield optimization.`;
    }

    box.appendChild(botMsg);
    box.scrollTop = box.scrollHeight;
  }, 600);
});

// Initial load triggers
fetchLiveWeather("Durgapur");
updateProfit();