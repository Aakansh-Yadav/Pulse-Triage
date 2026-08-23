import OpenAI from "openai";
import { config } from "../config.js";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type TriageResult = {
  severity: "high" | "low";
  risk_score: number;
  red_flags: string[];
  summary: string;
  recommended_action: "emergency" | "same_day_doctor" | "ai_self_care";
  care_plan: string;
  reply: string;
};

const RED_FLAGS: { pattern: RegExp; label: string }[] = [
  { pattern: /chest (pain|pressure|tightness)|crushing (pain|pressure)|pain radiating to (arm|jaw)/i, label: "Chest pain / possible ACS" },
  { pattern: /short(ness)? of breath|can'?t breathe|difficulty breathing|wheezing badly/i, label: "Respiratory distress" },
  { pattern: /face droop|slurred speech|one[- ]sided weakness|stroke|can'?t lift arm/i, label: "Stroke warning signs" },
  { pattern: /suicid|kill myself|end my life|want to die/i, label: "Suicidal ideation" },
  { pattern: /severe bleeding|bleeding (won'?t|will not) stop|coughing (up )?blood|vomiting blood/i, label: "Severe bleeding" },
  { pattern: /anaphyla|throat swell|tongue swell|can'?t swallow/i, label: "Anaphylaxis / airway" },
  { pattern: /seizure|unresponsive|passed out|loss of consciousness/i, label: "Altered consciousness / seizure" },
  { pattern: /stiff neck.+(fever|fever.+stiff neck)|worst headache of (my|his|her) life/i, label: "Possible meningitis / SAH" },
  { pattern: /pregnan.+(bleed|pain)|vaginal bleeding.+(pregnan|pregnant)/i, label: "Pregnancy emergency" },
  { pattern: /severe abdominal pain|rigid abdomen|black tarry stool/i, label: "Acute abdomen" },
  { pattern: /high fever|fever over 103|39\.|40\./i, label: "High fever" },
];

export function detectRedFlags(text: string) {
  return RED_FLAGS.filter((f) => f.pattern.test(text)).map((f) => f.label);
}

function userText(messages: ChatMessage[]) {
  return messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
}

function lastUser(messages: ChatMessage[]) {
  return messages.filter((m) => m.role === "user").at(-1)?.content.trim() || "";
}

function lastAssistant(messages: ChatMessage[]) {
  return messages.filter((m) => m.role === "assistant").at(-1)?.content.trim() || "";
}

function complaint(messages: ChatMessage[]) {
  return messages.find((m) => m.role === "user")?.content.trim().slice(0, 120) || "your symptoms";
}

function ruleBasedTriage(messages: ChatMessage[]): TriageResult {
  const text = userText(messages);
  const flags = detectRedFlags(text);
  const highHints =
    /severe|worst|unbearable|emergency|faint|dizzy|vomiting|blood|can't walk|10\/10|9\/10/i.test(text);
  const lowHints =
    /cold|runny nose|mild|sore throat|refill|rash|sprain|back pain for weeks|insomnia|hay fever/i.test(text);

  let score = 25;
  if (flags.length) score = Math.min(98, 70 + flags.length * 10);
  else if (highHints) score = 72;
  else if (lowHints) score = 18;

  const severity: "high" | "low" = score >= 70 || flags.length > 0 ? "high" : "low";
  const emergency = flags.some((f) => /ACS|stroke|suicid|anaphyla|bleeding|consciousness/i.test(f));

  if (severity === "high") {
    return {
      severity,
      risk_score: score,
      red_flags: flags,
      summary: flags.length
        ? `Red-flag symptoms detected: ${flags.join("; ")}. This patient needs a clinician today.`
        : "Symptom pattern suggests more than self-care. Same-day clinician review is safer.",
      recommended_action: emergency ? "emergency" : "same_day_doctor",
      care_plan:
        emergency
          ? "If this is happening now, call emergency services. You will also get the next first-come clinic slot, and hospital staff will stay with you if you have to wait."
          : "A doctor will see you in registration order. If someone is ahead of you, hospital staff will start bridge care so you do not deteriorate while waiting.",
      reply: emergency
        ? "These symptoms can be dangerous. If you are in distress, call emergency services now. I can book the next first-come doctor slot, and hospital staff can stay with you until then."
        : `From what you told me about ${complaint(messages)}, a same-day doctor visit is safer than self-care. Press “Classify & schedule” when you are ready — slots are first-come, first-served, and staff can cover you if you wait.`,
    };
  }

  return {
    severity: "low",
    risk_score: score,
    red_flags: [],
    summary: "Likely a low-acuity concern that can be guided by the AI health agent with doctor oversight.",
    recommended_action: "ai_self_care",
    care_plan:
      "Rest, hydrate, and use symptomatic care as appropriate. A doctor on the platform will still review this plan and is paid for that oversight. Return or escalate if symptoms worsen, you develop chest pain, trouble breathing, confusion, or a high fever.",
    reply: `This sounds lower risk than a clinic emergency, so I can keep helping you here about ${complaint(messages)}. A doctor still reviews my plan. Tell me what is bothering you most right now, or press “Classify & schedule” for a supervised self-care plan.`,
  };
}

function uniqueReply(messages: ChatMessage[], candidate: string) {
  const prev = lastAssistant(messages);
  if (candidate.trim() !== prev) return candidate;
  return `${candidate} What else is going on that I should know?`;
}

/** Reply to the latest patient line instead of repeating a canned classification. */
export function continueConversation(messages: ChatMessage[], classified?: "high" | "low" | null) {
  const said = lastUser(messages).toLowerCase();
  const n = messages.filter((m) => m.role === "user").length;
  const topic = complaint(messages);

  if (/^(ok|okay|k|yes|yep|yeah|sure|thanks|thank you|alright|fine)\.?$/i.test(said)) {
    if (classified === "high") {
      return uniqueReply(
        messages,
        "Understood. When you are ready, use “Classify & schedule” on the right to lock a first-come doctor slot. Until then: rest, avoid exertion, and say if pain, breathing, or dizziness gets worse.",
      );
    }
    if (classified === "low") {
      return uniqueReply(
        messages,
        "Okay. I can keep helping online. Would you like home-care steps for this, or do you want me to book a doctor visit anyway?",
      );
    }
    return uniqueReply(
      messages,
      "Got it. You can tell me more about how it feels, or press “Classify & schedule” when you want me to route you.",
    );
  }

  if (/\?/.test(said) || /what|how|can i|should i|do i need|when|why/.test(said)) {
    if (classified === "high") {
      return uniqueReply(
        messages,
        `Good question. For ${topic}, a clinician should still see you today in registration order. Staff can monitor you if you wait. If this is sudden chest pain, trouble breathing, or one-sided weakness, treat it as an emergency now.`,
      );
    }
    return uniqueReply(
      messages,
      `I can help with that. I am not a replacement for emergency care, but for ${topic} I can suggest next steps. Tell me the part you are most unsure about — rest, medicines you already take, or whether you need a clinic visit.`,
    );
  }

  if (/wors|worse|getting bad|can't sleep|cannot sleep|more pain|unbearable/.test(said)) {
    return uniqueReply(
      messages,
      "I’m sorry it is getting worse. Where is it now, what number is the pain from 1–10, and is there new shortness of breath, fainting, or chest pressure? If yes, seek emergency care. If not, I can still book today’s first-come clinic slot.",
    );
  }

  if (/better|improving|eased|gone/.test(said)) {
    return uniqueReply(
      messages,
      "Glad it eased a little. Keep an eye on it. If it comes back stronger, or you get fever, vomiting, or breathing trouble, tell me right away.",
    );
  }

  if (/headache|migraine/.test(said)) {
    return uniqueReply(
      messages,
      "For the headache: is it one-sided or all over, any visual changes, neck stiffness, or the worst headache of your life? How many hours has this attack lasted?",
    );
  }

  if (/fever|temperature|hot/.test(said)) {
    return uniqueReply(
      messages,
      "What was the highest temperature you measured, and have you had chills, rash, stiff neck, or confusion with it?",
    );
  }

  if (/cough|throat|cold|nose/.test(said)) {
    return uniqueReply(
      messages,
      "For the cough or throat: any blood, wheezing, chest tightness, or fever? How many days, and have you taken anything already (paracetamol, lozenges, inhaler)?",
    );
  }

  if (/pain|hurt|ache|sting/.test(said)) {
    return uniqueReply(
      messages,
      `I’m following the pain. Point me to where it is, a 1–10 intensity, whether it radiates, and what makes it better or worse.`,
    );
  }

  if (n <= 1) {
    return uniqueReply(
      messages,
      `I hear you: “${lastUser(messages).slice(0, 140)}”. When did this start, how intense is it from 1–10, and is it getting worse? Any chest pain, trouble breathing, fainting, or one-sided weakness?`,
    );
  }

  if (n === 2) {
    return uniqueReply(
      messages,
      `Thanks — I noted that. Any fever, vomiting, bleeding, pregnancy, or other conditions I should weigh for ${topic}? What have you already tried?`,
    );
  }

  return uniqueReply(
    messages,
    `Thanks, that helps. I have a clearer picture of ${topic}. You can add anything else that changed, or press “Classify & schedule” so I can route you (online with me, or a first-come doctor slot).`,
  );
}

export async function agentReply(
  messages: ChatMessage[],
  opts?: { classify?: boolean; alreadyClassified?: "high" | "low" | null },
): Promise<{ reply: string; result?: TriageResult }> {
  const flags = detectRedFlags(userText(messages));
  const already = opts?.alreadyClassified ?? null;
  const firstRedFlag = flags.length > 0 && !already;

  if (!opts?.classify && already) {
    return { reply: continueConversation(messages, already) };
  }

  if (!opts?.classify && !firstRedFlag) {
    return { reply: continueConversation(messages) };
  }

  if (!config.openaiKey) {
    const result = ruleBasedTriage(messages);
    result.reply = uniqueReply(messages, result.reply);
    return { reply: result.reply, result };
  }

  const openai = new OpenAI({ apiKey: config.openaiKey });
  const system = `You are Ava, the PulseTriage clinical health agent.
Safety first. You are not a replacement for emergency care.
Reply ONLY to the patient's latest message. Never repeat a previous assistant message verbatim.
Ask at most one or two focused follow-up questions unless they asked you to classify.
If red flags exist (chest pain, dyspnea, stroke signs, severe bleeding, anaphylaxis, suicidal ideation, seizure, unresponsiveness), classify HIGH and tell them to seek emergency care if in distress.
HIGH severity still gets a same-day clinician appointment, first-come first-served, with hospital staff cover if they wait.
LOW severity: you may manage with a self-care plan; a doctor reviews it.
Never invent a definitive diagnosis. Be concise, warm, and specific to what they just said.
Always return JSON with keys: reply, severity ("high"|"low"|null), risk_score (0-100), red_flags (string[]), summary, recommended_action ("emergency"|"same_day_doctor"|"ai_self_care"|null), care_plan.
If you still need information and there are no red flags, set severity to null and only fill reply.`;

  const completion = await openai.chat.completions.create({
    model: config.openaiModel,
    response_format: { type: "json_object" },
    temperature: 0.5,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { reply: raw };
  }

  let reply = uniqueReply(messages, String(parsed.reply || continueConversation(messages, already)));
  const forcedHigh = firstRedFlag;
  const severity =
    parsed.severity === "high" || parsed.severity === "low"
      ? parsed.severity
      : forcedHigh
        ? "high"
        : undefined;

  if (!opts?.classify && !forcedHigh) {
    return { reply };
  }

  const base = ruleBasedTriage(messages);
  const result: TriageResult = {
    severity: (forcedHigh ? "high" : severity) || base.severity,
    risk_score: Number(parsed.risk_score ?? base.risk_score),
    red_flags: Array.isArray(parsed.red_flags) ? (parsed.red_flags as string[]) : flags,
    summary: String(parsed.summary || base.summary),
    recommended_action:
      parsed.recommended_action === "emergency" ||
      parsed.recommended_action === "same_day_doctor" ||
      parsed.recommended_action === "ai_self_care"
        ? parsed.recommended_action
        : base.recommended_action,
    care_plan: String(parsed.care_plan || base.care_plan),
    reply,
  };
  if (forcedHigh) {
    result.severity = "high";
    result.recommended_action =
      result.recommended_action === "ai_self_care" ? "same_day_doctor" : result.recommended_action;
  }
  return { reply, result };
}
