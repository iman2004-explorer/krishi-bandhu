const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

export function initializeAiChat({ getFarmContext, money }) {
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");
  const chatStatus = document.getElementById("chatStatus");
  const chatSend = document.getElementById("chatSend");
  const chatHistory = [];
  let textGeneratorPromise;

  function loadTextGenerator() {
    if (!textGeneratorPromise) {
      chatStatus.textContent = "Loading the free AI model. The first download may take a few minutes...";
      textGeneratorPromise = import(TRANSFORMERS_URL)
        .then(({ pipeline, env }) => {
          env.allowLocalModels = false;
          return pipeline("text-generation", MODEL_ID, {
            dtype: "q4",
            progress_callback: progress => {
              if (progress.status === "progress" && Number.isFinite(progress.progress)) {
                chatStatus.textContent = `Downloading AI model: ${Math.round(progress.progress)}%`;
              }
            }
          });
        })
        .catch(error => {
          textGeneratorPromise = null;
          throw error;
        });
    }

    return textGeneratorPromise;
  }

  chatForm.addEventListener("submit", async event => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || chatSend.disabled) return;

    const userMessage = document.createElement("div");
    userMessage.className = "message user";
    userMessage.textContent = text;
    chatMessages.appendChild(userMessage);

    const botMessage = document.createElement("div");
    botMessage.className = "message bot";
    botMessage.textContent = "Preparing your answer...";
    chatMessages.appendChild(botMessage);

    chatInput.value = "";
    chatSend.disabled = true;
    chatStatus.textContent = "Preparing your answer...";
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const farm = getFarmContext();
    const context = `Farm context: location ${farm.location}; season ${farm.season}; soil ${farm.soil}; land ${farm.land} acres; selected crop ${farm.cropName}; estimated yield ${farm.crop.yieldPerAcre} quintals per acre; crop water need ${farm.crop.water}; current weather ${farm.temperature}, humidity ${farm.humidity}; estimated investment ${farm.investment}; estimated expenses ${farm.expenses}; estimated revenue ${farm.revenue}; estimated net profit ${farm.profit}. These are rough app estimates, not verified market quotes.`;
    const messages = [
      {
        role: "system",
        content: `You are Krishi Bandhu, a concise and cautious agriculture assistant for Indian farmers. Answer the user's actual question in plain language and use the farm context when relevant. Do not invent live facts, prices, yields, or precise agronomy measurements. Never calculate financial figures; use only the exact app estimates that will be shown separately. For pesticide, fertilizer dosage, disease diagnosis, or high-stakes decisions, give general safety guidance and recommend confirming locally with a KVK or agricultural extension officer. Farm context: ${context}`
      },
      ...chatHistory.slice(-6),
      { role: "user", content: text }
    ];

    try {
      const generator = await loadTextGenerator();
      chatStatus.textContent = "AI is generating a reply...";
      const result = await generator(messages, {
        max_new_tokens: 128,
        do_sample: true,
        temperature: 0.4,
        top_p: 0.9,
        repetition_penalty: 1.1
      });
      const generated = result[0].generated_text;
      const answer = Array.isArray(generated) ? generated.at(-1)?.content : generated;
      if (!answer || !answer.trim()) throw new Error("The model returned an empty response.");

      const financialQuestion = /profit|cost|expense|investment|money|budget|revenue/i.test(text);
      const estimates = financialQuestion
        ? `\n\nApp estimates for ${farm.cropName} (${farm.land} acres): investment ${farm.investment}, expenses ${farm.expenses}, gross revenue ${farm.revenue}, net profit ${farm.profit}. These are rough estimates, not verified market quotes.`
        : "";
      botMessage.textContent = `${answer.trim()}${estimates}\n\nPlease verify important crop and treatment decisions with your local KVK or agricultural extension officer.`;
      chatHistory.push({ role: "user", content: text }, { role: "assistant", content: answer.trim() });
      chatStatus.textContent = "AI ready · running privately in your browser · no API key";
    } catch (error) {
      console.error("AI chat failed:", error);
      botMessage.textContent = "I couldn't load the AI model. Check your internet connection and open this page through a local web server, then try again. No API key is needed.";
      chatStatus.textContent = "AI could not start. Check your connection and try again.";
    } finally {
      chatSend.disabled = false;
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}