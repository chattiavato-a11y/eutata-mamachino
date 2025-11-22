// js/chat.js — lightweight client wired to the Cloudflare Worker chat API
// Usage: import this script in a page that defines appendMessage(role, text, meta?)
// and optionally provides window.FallbackKB.reply(text, { locale }) for local replies.

const API_BASE = "https://withered-mouse-9aee.grabem-holdem-nuts-right.workers.dev";

async function sendMessage(userText) {
  // 1) Show user's message
  appendMessage("user", userText);

  try {
    const body = {
      messages: [
        { role: "user", content: userText }
      ],
      metadata: {
        // later you can add training_memory, tier, etc.
      }
    };

    const res = await fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json"
        // later: X-Integrity, X-Request-Signature, etc.
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    let replyText = (data && data.reply) ? String(data.reply).trim() : "";
    const confidence = (data && data.confidence) || "unknown";

    let usedFallback = false;

    // 2) Decide whether to fallback
    if (!replyText || confidence === "low") {
      if (window.FallbackKB && typeof window.FallbackKB.reply === "function") {
        const fb = window.FallbackKB.reply(userText, { locale: "auto" });
        replyText = fb.text || "I’m here to help with OPS.";
        usedFallback = true;
      }
    }

    // 3) Render assistant response (original or fallback)
    appendMessage("assistant", replyText, {
      confidence,
      escalated: !!data.escalated,
      usedFallback
    });

  } catch (err) {
    console.error("chat error", err);
    const fb = window.FallbackKB && window.FallbackKB.reply
      ? window.FallbackKB.reply("fallback network error", { locale: "en" })
      : { text: "I’m having trouble connecting right now, but OPS is still here to help you." };

    appendMessage("assistant", fb.text, {
      confidence: "low",
      usedFallback: true
    });
  }
}

// Simple DOM helper stub — adjust to your actual UI
function appendMessage(role, text, meta) {
  // Your existing rendering logic here
  console.log(`${role}:`, text, meta || {});
}
