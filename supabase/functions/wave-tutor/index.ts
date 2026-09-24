const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function authHeaders(token: string) {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "authorization": "Bearer " + token,
    "content-type": "application/json"
  };
}

async function getUser(token: string) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { "apikey": SUPABASE_ANON_KEY, "authorization": "Bearer " + token }
  });
  if (!r.ok) return null;
  return await r.json();
}

async function rest(path: string, token: string, init: RequestInit = {}) {
  const headers = { ...authHeaders(token), ...(init.headers || {}) };
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { ...init, headers });
  const text = await r.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + text.slice(0, 500));
  return data;
}

function outputText(response: any) {
  const parts: string[] = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const c of item.content || []) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function cleanContext(value: any) {
  const x = value && typeof value === "object" ? value : {};
  return {
    product: String(x.product || "").slice(0, 60),
    page: String(x.page || "").slice(0, 120),
    course_id: String(x.course_id || "").slice(0, 80),
    lesson_id: String(x.lesson_id || "").slice(0, 80),
    title: String(x.title || "").slice(0, 200),
    selected_text: String(x.selected_text || "").slice(0, 2500),
    screen_summary: String(x.screen_summary || "").slice(0, 3500),
    data: x.data && typeof x.data === "object" ? x.data : {}
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "auth_required" }, 401);

  const user = await getUser(token);
  if (!user?.id) return json({ error: "invalid_session" }, 401);

  if (!OPENAI_API_KEY) {
    return json({
      error: "ai_not_configured",
      message: "WAVE Tutor is deployed, but OPENAI_API_KEY has not been added to the Supabase Edge Function secrets yet."
    }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const message = String(body?.message || "").trim().slice(0, 6000);
  const mode = ["explain","socratic","quiz","research"].includes(body?.mode) ? body.mode : "explain";
  const context = cleanContext(body?.page_context);
  if (!message) return json({ error: "message_required" }, 400);

  let conversationId = String(body?.conversation_id || "").trim();
  if (!conversationId) {
    const created = await rest("ai_conversations", token, {
      method: "POST",
      headers: { "prefer": "return=representation" },
      body: JSON.stringify([{
        user_id: user.id,
        title: message.slice(0, 80),
        page_context: context
      }])
    });
    conversationId = created?.[0]?.id;
  } else {
    const owned = await rest("ai_conversations?id=eq." + encodeURIComponent(conversationId) + "&select=id&limit=1", token);
    if (!owned?.length) return json({ error: "conversation_not_found" }, 404);
  }

  await rest("ai_messages", token, {
    method: "POST",
    body: JSON.stringify([{
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: message,
      page_context: context
    }])
  });

  const [profileRows, progressRows, aiRows, messageRows, knowledgeRows] = await Promise.all([
    rest("profiles?user_id=eq." + user.id + "&select=full_name,email&limit=1", token),
    rest("student_progress?user_id=eq." + user.id + "&select=progress&limit=1", token),
    rest("student_ai_profile?user_id=eq." + user.id + "&select=knowledge_map,strong_topics,weak_topics,learning_preferences,tutor_summary&limit=1", token),
    rest("ai_messages?conversation_id=eq." + encodeURIComponent(conversationId) + "&select=role,content,created_at&order=created_at.desc&limit=14", token),
    rest("course_knowledge?select=course_id,lesson_id,title,content,concepts&limit=40", token)
  ]);

  const student = profileRows?.[0] || {};
  const progress = progressRows?.[0]?.progress || {};
  const aiProfile = aiRows?.[0] || {
    knowledge_map: {}, strong_topics: [], weak_topics: [], learning_preferences: {}, tutor_summary: ""
  };

  const terms = (message + " " + context.title + " " + context.selected_text + " " + context.course_id)
    .toLowerCase().split(/[^a-z0-9]+/).filter((x: string) => x.length > 3);
  const knowledge = (knowledgeRows || [])
    .map((k: any) => {
      const hay = (k.course_id + " " + k.lesson_id + " " + k.title + " " + k.content + " " + (k.concepts || []).join(" ")).toLowerCase();
      let score = context.course_id && k.course_id === context.course_id ? 8 : 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      return { ...k, score };
    })
    .sort((a: any,b: any) => b.score - a.score)
    .slice(0, 5);

  const history = (messageRows || []).slice().reverse().map((m: any) => ({
    role: m.role, content: String(m.content).slice(0, 3000)
  }));

  const system = `You are WAVE AI Tutor, a personal finance and markets education tutor embedded inside WAVE Platform.

PURPOSE
Teach the user to understand markets, research methods, valuation, macro, crypto, quant and risk. You are an educator and analytical coach, not a trade signal generator.

TEACHING RULES
1. Diagnose the missing concept before adding complexity.
2. Explain at the user's demonstrated level.
3. Connect new material to concepts the user already understands.
4. Prefer concrete market examples when useful.
5. Distinguish facts, assumptions, interpretation and uncertainty.
6. Never invent WAVE course material or live data. If context is absent, say what is missing.
7. If the user asks about the current screen, use PAGE CONTEXT explicitly.
8. In Socratic mode, lead with questions rather than giving the conclusion immediately.
9. In Quiz mode, ask one question at a time unless the user requests a full quiz.
10. In Research mode, give a deeper answer but do not claim live web verification unless live evidence is included in context.
11. Do not make investment decisions for the user. Explain evidence, mechanisms, risks and alternative interpretations.

The response must be useful on its own and concise enough for an in-product tutor panel.`;

  const prompt = {
    mode,
    student: {
      name: student.full_name || "",
      progress,
      knowledge_map: aiProfile.knowledge_map || {},
      strong_topics: aiProfile.strong_topics || [],
      weak_topics: aiProfile.weak_topics || [],
      learning_preferences: aiProfile.learning_preferences || {},
      tutor_summary: aiProfile.tutor_summary || ""
    },
    page_context: context,
    wave_knowledge: knowledge.map((k: any) => ({
      course_id:k.course_id, lesson_id:k.lesson_id, title:k.title, content:k.content, concepts:k.concepts
    })),
    recent_conversation: history,
    user_message: message
  };

  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
      check_question: { type: ["string","null"] },
      learning_update: {
        type: "object",
        properties: {
          topic: { type: "string" },
          event_type: { type: "string", enum: ["question","misconception","explained","demonstrated_understanding","quiz_result"] },
          score: { type: ["number","null"] },
          confidence: { type: ["number","null"] },
          strong_topics: { type: "array", items: { type: "string" } },
          weak_topics: { type: "array", items: { type: "string" } },
          tutor_summary: { type: "string" }
        },
        required: ["topic","event_type","score","confidence","strong_topics","weak_topics","tutor_summary"],
        additionalProperties: false
      }
    },
    required: ["answer","check_question","learning_update"],
    additionalProperties: false
  };

  const openai = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + OPENAI_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(prompt) }
      ],
      max_output_tokens: 1800,
      text: {
        format: {
          type: "json_schema",
          name: "wave_tutor_response",
          strict: true,
          schema
        }
      }
    })
  });

  const openaiText = await openai.text();
  if (!openai.ok) {
    console.error("OpenAI error", openai.status, openaiText.slice(0, 1000));
    return json({ error: "model_error", message: "The tutor model could not answer right now." }, 502);
  }

  let parsed: any;
  try {
    const raw = JSON.parse(openaiText);
    parsed = JSON.parse(outputText(raw));
  } catch (e) {
    console.error("Tutor parse error", String(e), openaiText.slice(0, 1200));
    return json({ error: "model_parse_error" }, 502);
  }

  const answer = String(parsed?.answer || "").trim();
  if (!answer) return json({ error: "empty_model_response" }, 502);

  await rest("ai_messages", token, {
    method: "POST",
    body: JSON.stringify([{
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: answer + (parsed.check_question ? "\n\n" + parsed.check_question : ""),
      page_context: context
    }])
  });

  const lu = parsed.learning_update || {};
  if (lu.topic) {
    await rest("learning_events", token, {
      method: "POST",
      body: JSON.stringify([{
        user_id: user.id,
        topic: String(lu.topic).slice(0,120),
        event_type: lu.event_type || "explained",
        score: typeof lu.score === "number" ? Math.max(0, Math.min(1, lu.score)) : null,
        confidence: typeof lu.confidence === "number" ? Math.max(0, Math.min(1, lu.confidence)) : null,
        source: "wave_tutor",
        metadata: { mode, page_context: context }
      }])
    });
  }

  await rest("student_ai_profile?on_conflict=user_id", token, {
    method: "POST",
    headers: { "prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: user.id,
      knowledge_map: aiProfile.knowledge_map || {},
      strong_topics: Array.isArray(lu.strong_topics) ? lu.strong_topics.slice(0,30) : (aiProfile.strong_topics || []),
      weak_topics: Array.isArray(lu.weak_topics) ? lu.weak_topics.slice(0,30) : (aiProfile.weak_topics || []),
      learning_preferences: aiProfile.learning_preferences || {},
      tutor_summary: String(lu.tutor_summary || aiProfile.tutor_summary || "").slice(0,3000),
      updated_at: new Date().toISOString()
    }])
  });

  await rest("ai_conversations?id=eq." + encodeURIComponent(conversationId), token, {
    method: "PATCH",
    headers: { "prefer": "return=minimal" },
    body: JSON.stringify({ page_context: context, updated_at: new Date().toISOString() })
  });

  return json({
    conversation_id: conversationId,
    answer,
    check_question: parsed.check_question || null,
    learning: {
      topic: lu.topic || "",
      event_type: lu.event_type || "explained"
    },
    model: OPENAI_MODEL
  });
});