// src/services/ai-copilot.js
import { fetchGeminiApiKey, getGeminiApiKey } from './rtdb.js';
import { bus } from '../core/bus.js';
import { registry } from '../engine/registry.js';

let isAvailable = false;

export async function initAICopilot() {
  const key = await fetchGeminiApiKey();
  if (key) {
    isAvailable = true;
    bus.emit('ai:status', { available: true });
  } else {
    isAvailable = false;
    bus.emit('ai:status', { available: false });
  }
}

export function isCopilotAvailable() {
  return isAvailable;
}

/**
 * Probabilistic Tool Matcher
 * Scores and ranks tools based on exact keywords, partial tokens, categories, and dynamic tool keywords.
 */
function calculateToolProbabilities(query) {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/[\s,._-]+/).filter(Boolean);
  const allTools = registry.getAllTools();
  const scores = {};

  allTools.forEach(tool => {
    scores[tool.id] = { tool, score: 0 };
  });

  // 1. Direct registry keyword match
  const directMatches = registry.matchToolByKeyword(q);
  directMatches.forEach((tool, idx) => {
    scores[tool.id].score += (10 - idx * 2);
  });

  // 2. Token-level & Dynamic Graph Matching
  tokens.forEach(token => {
    allTools.forEach(tool => {
      const titleLower = tool.title.toLowerCase();
      const descLower = tool.description.toLowerCase();
      const catLower = tool.category.toLowerCase();
      const idLower = tool.id.toLowerCase();
      const keywords = tool.keywords || [];

      // Check dynamic tool keywords array
      if (keywords.some(kw => kw.toLowerCase() === token || kw.toLowerCase().includes(token))) {
        scores[tool.id].score += 8;
      }

      if (idLower.includes(token)) scores[tool.id].score += 5;
      if (titleLower.includes(token)) scores[tool.id].score += 4;
      if (descLower.includes(token)) scores[tool.id].score += 2;
      if (catLower.includes(token)) scores[tool.id].score += 3;
    });
  });

  // Sort and filter tools with positive probability scores
  return Object.values(scores)
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.tool);
}

export async function askCopilot(userPrompt) {
  const rankedTools = calculateToolProbabilities(userPrompt);
  const allTools = registry.getAllTools();

  // If Gemini API is not configured or offline, use Smart Probabilistic Engine
  if (!isAvailable) {
    setTimeout(() => {
      if (rankedTools.length > 0) {
        const topTools = rankedTools.slice(0, 3);
        const isSingle = topTools.length === 1;
        bus.emit('ai:message', {
          role: 'ai',
          text: isSingle 
            ? `I found the exact tool for your request: **${topTools[0].title}**. Tap below to launch it:`
            : `Here are the best matching tools for "${userPrompt}". Tap any tool to open it directly:`,
          suggestedTools: topTools
        });
      } else {
        bus.emit('ai:message', {
          role: 'ai',
          text: `I couldn't find a direct tool for "${userPrompt}". Here are some popular tools you can use:`,
          suggestedTools: allTools.slice(0, 4)
        });
      }
    }, 350);
    return;
  }

  // Online Gemini Mode
  const key = getGeminiApiKey();
  const toolsSummary = allTools.map(t => ({ id: t.id, title: t.title, category: t.category, description: t.description }));
  
  const systemInstruction = `
    You are OmniTools AI Copilot, a fast and helpful browser assistant.
    Available local tools:
    ${JSON.stringify(toolsSummary)}
    
    If the user's prompt is asking to do something with files (e.g., convert, compress, merge, png, pdf), you MUST return a JSON object in this format:
    {"type": "TOOL_SUGGESTION", "toolIds": ["matched-tool-id1", "matched-tool-id2"], "message": "Friendly explanation"}
    
    If it's a general greeting or question, reply with helpful markdown text.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userPrompt }] }]
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const data = await response.json();
    const textResp = data.candidates[0].content.parts[0].text.trim();
    
    try {
      const parsed = JSON.parse(textResp);
      if (parsed.type === 'TOOL_SUGGESTION' && Array.isArray(parsed.toolIds)) {
        const matched = parsed.toolIds.map(id => registry.getTool(id)).filter(Boolean);
        bus.emit('ai:message', {
          role: 'ai',
          text: parsed.message || 'Here are the recommended tools:',
          suggestedTools: matched.length > 0 ? matched : rankedTools.slice(0, 3)
        });
        return;
      }
    } catch (e) {
      // Not JSON, regular text response
    }

    // If Gemini replied in text, also attach probabilistic tools if high confidence
    const attachedTools = rankedTools.length > 0 ? rankedTools.slice(0, 2) : [];
    bus.emit('ai:message', { 
      role: 'ai', 
      text: textResp,
      suggestedTools: attachedTools.length > 0 ? attachedTools : undefined
    });

  } catch (error) {
    console.warn('[AI Copilot] Remote API fallback:', error);
    // Graceful offline fallback
    if (rankedTools.length > 0) {
      bus.emit('ai:message', {
        role: 'ai',
        text: `Here are the matching tools for "${userPrompt}":`,
        suggestedTools: rankedTools.slice(0, 3)
      });
    } else {
      bus.emit('ai:message', {
        role: 'ai',
        text: 'I can help you convert, compress, and edit Images, PDFs, and Vectors locally. Choose a tool below:',
        suggestedTools: allTools.slice(0, 4)
      });
    }
  }
}
