import { retrieveFarmKnowledge } from "./farm-knowledge.js";
import { processQuery, getLanguageLabel, resolveChatTopic } from "./bengali-support.js";

const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

export function initializeAiChat({ getFarmContext, money }) {
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatTopic = document.getElementById("chatTopic");
  const chatMessages = document.getElementById("chatMessages");
  const chatStatus = document.getElementById("chatStatus");
  const chatSend = document.getElementById("chatSend");
  const chatHistory = [];
  let textGeneratorPromise;
  const topicNames = {
    general: "General farming",
    "field-crops": "Field crops",
    fruits: "Fruits",
    flowers: "Flowers",
    spices: "Spices"
  };

  chatTopic.addEventListener("change", () => {
    chatHistory.length = 0;
    chatStatus.textContent = `Topic set to ${topicNames[chatTopic.value]}. Ask a question to get tailored guidance.`;
  });

  function loadTextGenerator() {
    if (!textGeneratorPromise) {
      chatStatus.textContent = "Loading the free AI model. The first download may take a few minutes...";
      textGeneratorPromise = import(TRANSFORMERS_URL)
        .then(async ({ pipeline, env, TextStreamer }) => {
          env.allowLocalModels = false;
          const loadPipeline = device => pipeline("text-generation", MODEL_ID, {
            device,
            dtype: device === "webgpu" ? "q4f16" : "q4",
            progress_callback: progress => {
              if (progress.status === "progress" && Number.isFinite(progress.progress)) {
                chatStatus.textContent = `Downloading AI model: ${Math.round(progress.progress)}%`;
              }
            }
          });
          let adapter;
          try {
            adapter = await navigator.gpu?.requestAdapter();
          } catch (error) {
            console.warn("WebGPU adapter unavailable; using CPU mode.", error);
          }
          if (adapter) {
            try {
              const generator = await loadPipeline("webgpu");
              return { generator, TextStreamer, device: "webgpu" };
            } catch (error) {
              console.warn("WebGPU model initialization failed; falling back to CPU.", error);
              chatStatus.textContent = "GPU setup unavailable. Switching to CPU mode...";
            }
          }
          const generator = await loadPipeline("wasm");
          return { generator, TextStreamer, device: "wasm" };
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

    // --- Bengali NLP support ---
    const { original, translated, isBengali, isScript } = processQuery(text);
    const langLabel = getLanguageLabel(isBengali, isScript);
    const modelText = translated;
    // --- End Bengali NLP support ---

    const farm = getFarmContext();
    const cropContext = farm.crop
      ? `estimated yield ${farm.crop.yieldPerAcre} quintals per acre; crop water need ${farm.crop.water}`
      : "no verified yield or crop-specific water estimate is available for this fruit, flower, or spice";
    const context = `Farm context: location ${farm.location}; season ${farm.season}; soil ${farm.soil}; land ${farm.land} acres; selected plant ${farm.cropName}; ${cropContext}; current weather ${farm.temperature}, humidity ${farm.humidity}; estimated investment ${farm.investment}; estimated expenses ${farm.expenses}; estimated revenue ${farm.revenue}; estimated net profit ${farm.profit}. These are rough app estimates, not verified market quotes.`;
    const topic = resolveChatTopic(text, chatTopic.value);
    if (topic !== chatTopic.value) {
      chatTopic.value = topic;
      chatHistory.length = 0;
    }

    // Use translated text for knowledge retrieval so Bengali queries match English terms
    const knowledge = retrieveFarmKnowledge({ topic, question: modelText, farm });
    const retrievedNotes = knowledge
      .slice(0, 2)
      .map((note, index) => `${index + 1}. ${note.title}: ${note.guidance}`)
      .join("\n");

    // Update system prompt to support Bengali
    const responseLanguage = isScript
      ? "Reply in clear, simple Bengali using Bengali script."
      : isBengali
        ? "Reply in simple Bengali written with the English alphabet (Banglish). Do not switch to English or Bengali script."
        : "Reply in English.";
    const systemPrompt = `You are Krishi Bandhu, a practical agriculture assistant for Indian farmers. The selected topic is ${topicNames[topic]}. ${responseLanguage} Answer the user's actual question, using the retrieved notes first and the farm context when relevant. Keep the reply concise, usually 3-5 short sentences. Give useful details about suitable season, soil, planting, irrigation, care, monitoring, harvest, and post-harvest only as relevant. Retrieved notes are general guidance, not a guarantee for every variety or district. If the notes do not cover a crop or fact, say so and ask for the variety or district, or clearly label general knowledge. Do not invent exact fertilizer or pesticide doses, diagnoses, current prices, yields, or live facts. Never calculate financial figures; use only the app's exact estimates shown separately. For chemical use or serious disease, direct the farmer to the product label and local KVK/agricultural extension officer. Farm context: ${context}\nRetrieved agriculture notes:\n${retrievedNotes}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-4),
      {
        role: "user",
        content: isBengali && !isScript
          ? `Bengali question written with English letters: ${original}\nBest-effort English translation for context: ${modelText}`
          : modelText
      }
    ];

    try {
      const { generator, TextStreamer, device } = await loadTextGenerator();
      chatStatus.textContent = device === "webgpu"
        ? "AI is writing your reply with GPU acceleration..."
        : "AI is writing your reply in CPU mode...";
      let streamedAnswer = "";
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        callback_function: chunk => {
          streamedAnswer += chunk;
          botMessage.textContent = streamedAnswer;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      });
      const result = await generator(messages, {
        max_new_tokens: 80,
        do_sample: true,
        temperature: 0.4,
        top_p: 0.9,
        repetition_penalty: 1.1,
        streamer
      });
      const generated = result[0].generated_text;
      const answer = streamedAnswer.trim() || (Array.isArray(generated) ? generated.at(-1)?.content : generated);
      if (!answer || !answer.trim()) throw new Error("The model returned an empty response.");

      const financialQuestion = /profit|cost|expense|investment|money|budget|revenue|লাভ|খরচ|ব্যয়|বিনিয়োগ|টাকা|আয়|দাম/i.test(`${modelText} ${text}`);
      const estimates = financialQuestion
        ? isBengali
          ? isScript
            ? `\n\n${farm.cropName} (${farm.land} একর) এর অ্যাপের আনুমানিক হিসাব: বিনিয়োগ ${farm.investment}, খরচ ${farm.expenses}, মোট আয় ${farm.revenue}, নিট লাভ ${farm.profit}। এগুলি আনুমানিক, নিশ্চিত বাজারদর নয়।`
            : `\n\n${farm.cropName} (${farm.land} acre) er app-er andaj: binioyog ${farm.investment}, khoroch ${farm.expenses}, mot ay ${farm.revenue}, net labh ${farm.profit}. Egulo andaj, nishchit bazardor noy.`
          : `\n\nApp estimates for ${farm.cropName} (${farm.land} acres): investment ${farm.investment}, expenses ${farm.expenses}, gross revenue ${farm.revenue}, net profit ${farm.profit}. These are rough estimates, not verified market quotes.`
        : "";
      const verificationNote = isBengali
        ? isScript
          ? "স্থানীয় জাত, চিকিৎসা-সংক্রান্ত পরামর্শ এবং বর্তমান দাম KVK বা কৃষি সম্প্রসারণ কর্মকর্তার সঙ্গে যাচাই করুন।"
          : "Sthanio jat, chikitsa poramorsho ebong bortoman dam KVK ba krishi somprosaron kormokortar songe jachai korun."
        : `Topic: ${topicNames[topic]}. Verify local varieties, treatment advice, and current prices with your KVK or agricultural extension officer.`;
      botMessage.textContent = `${answer.trim()}${estimates}\n\n${verificationNote}`;

      chatHistory.push({ role: "user", content: isBengali && !isScript ? original : modelText }, { role: "assistant", content: answer.trim() });
      chatStatus.textContent = `AI ready · running privately in your browser · no API key · ${langLabel}`;
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