// Turns raw pasted text (worksheets, PDF copy-paste, messy layouts) into structured
// multiple-choice questions via the Groq proxy at /api/ai-analyze.
// The model only restructures: it must not invent, reword or translate content.

const MC_SYSTEM_PROMPT = `You convert raw text containing multiple-choice questions into JSON.

STRICT RULES:
- Do NOT invent, reword, translate, fix or summarize anything. Copy question and option text exactly as written (keep original spelling, punctuation, blanks like "____", and language).
- Remove numbering/labels: "1.", "Q1:", "Câu 1:", "Question 1)", and option letters "A.", "(B)", "c)".
- DROP junk that is not part of any question, option, instruction or passage: page numbers ("Page 3", "- 12 -", "3/10"), running headers/footers, school/publisher names, watermarks, URLs, copyright lines, "Name: ____ Class: ____ Date: ____", scores ("/10 points"), "Turn over", "THE END", stray symbols or broken PDF characters, and repeated lines from page breaks.
- If junk lands in the middle of a question (e.g. a page break splitting a sentence), remove it and rejoin the question text.
- When unsure whether something is junk or real content, KEEP it.
- QUESTION STEMS ARE NEVER JUNK, even when the same sentence repeats on every question (e.g. "Which choice completes the text with the most logical transition?", "Which choice completes the text so that it conforms to the conventions of Standard English?", "What is the main idea of the text?"). Never drop them and never move them to "intro".
- A question's "question" field = everything belonging to that question: its own passage/text (if any) followed by its stem, separated by a blank line ("\\n\\n"). Example: "Ana studied for weeks. ______, she passed the exam.\\n\\nWhich choice completes the text with the most logical transition?"
- LINE BREAKS: pasted PDF text is hard-wrapped. Join lines that are just wrapped parts of the same sentence/paragraph into one line with single spaces. Blanks like "______" stay inline inside their sentence, never on their own line. Keep a line break only for real structure: between paragraphs, between "Text 1" / "Text 2", list items, poem lines, or table rows. This reflow is allowed; changing words is not.
- "Repeated lines" junk means only page headers/footers repeated across pages, not text that is part of a question.
- Keep every question in the order it appears. Do not skip or merge questions.
- Correct answer: look for an answer key anywhere (e.g. "Answer: B", "Đáp án: C", a key table at the end like "1-A 2-C", "*" or bold or underline markers, "=" prefix). If found, set "answer_source": "text".
- If NO answer is given for a question, pick the most likely correct option yourself and set "answer_source": "guessed".
- "explanation": copy the overall explanation/rationale for that question if the text provides one (it may be right under the question or in an answer section at the end, matched by question number). Otherwise "".
- "option_explanations": same length as "options". If the text explains individual choices, put each one at that option's index. Use "" for options with no explanation.
  Explanations can be written in ANY format or language. Match them to options by meaning, for example:
  • by letter: "Choice A is incorrect…", "A. Wrong –", "(B) ✓", "C: sai vì…", "Đáp án D đúng vì…", "Loại A vì…", "A ×", "→ B"
  • by number: "Option 2 is…", "1) incorrect"
  • by quoting the option's text instead of its letter: "'However' doesn't work because…", "Using 'therefore' implies…"
  • markers like ✓ ✗ ✔ × "correct/incorrect", "right/wrong", "đúng/sai", "best answer", "distractor"
  • one paragraph that discusses several options: split it so each option gets the sentence(s) about it. If a sentence covers two options at once ("A and D are wrong because…"), give that sentence to both.
  • text that isn't about any specific option (general grammar rule, translation, summary of the passage) goes in "explanation".
- The explanation of WHY THE CORRECT ANSWER IS CORRECT (e.g. "Choice B is the best answer because…") MUST go in option_explanations[correct_answer]. Never leave the correct option's slot empty when the text explains it.
- Explanations follow the same no-rewording rule: copy them, never write your own.
- "intro": only a shared instruction or passage that appears ONCE before all the questions (e.g. "Choose the best answer"). Anything that appears per question belongs in that question, not here. Otherwise "".

Return ONLY a JSON object, no markdown fences, no commentary:
{
  "intro": "string",
  "questions": [
    {
      "question": "passage text (if any)\\n\\nquestion stem",
      "options": ["string", "string", ...],
      "correct_answer": 0,
      "answer_source": "text" | "guessed",
      "explanation": "string",
      "option_explanations": ["string", ...]
    }
  ]
}
"correct_answer" is the 0-based index into "options".`

const extractJson = (text) => {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fall back to the outermost {...} block
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('AI did not return JSON')
    return JSON.parse(cleaned.slice(start, end + 1))
  }
}

// Pull blanks ("____") back into their sentence when a single PDF line break
// split them off. Paragraph breaks (\n\n) are left alone.
const inlineBlanks = (text) =>
  text
    .replace(/([^\n])[ \t]*\n[ \t]*(_{2,})/g, '$1 $2')
    .replace(/(_{2,})[ \t]*\n[ \t]*([.,;:!?)])/g, '$1$2') // "____\n," → "____,"
    .replace(/(_{2,})[ \t]*\n[ \t]*([^\n])/g, '$1 $2')

export const formatMultipleChoiceWithAI = async (rawText) => {
  const response = await fetch('/api/ai-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: MC_SYSTEM_PROMPT },
        { role: 'user', content: rawText }
      ],
      max_tokens: 16000,
      temperature: 0.1
    })
  })

  const resData = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(resData.error || `API error: ${response.status}`)
  if (!resData.result) throw new Error('No response from AI. Please try again.')

  const parsed = extractJson(resData.result)
  const rawQuestions = Array.isArray(parsed) ? parsed : parsed?.questions
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('AI found no questions in the text.')
  }

  const stamp = Date.now()
  const questions = rawQuestions
    .filter(q => q && typeof q.question === 'string')
    .map((q, i) => {
      // Keep option + its explanation paired while dropping empty options
      const rawExpl = Array.isArray(q.option_explanations) ? q.option_explanations : []
      const pairs = (Array.isArray(q.options) ? q.options : [])
        .map((o, oi) => ({ text: String(o ?? '').trim(), expl: String(rawExpl[oi] ?? '').trim() }))
        .filter(p => p.text)
      const options = pairs.map(p => p.text)
      const idx = Number.parseInt(q.correct_answer, 10)
      const correct = Number.isInteger(idx) && idx >= 0 && idx < options.length ? idx : 0
      const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : ''
      // Fallback: the correct option always gets an explanation if one exists
      if (pairs[correct] && !pairs[correct].expl && explanation) pairs[correct].expl = explanation
      return {
        id: `q${stamp}_ai${i}`,
        question: inlineBlanks(q.question.trim()),
        options: options.length >= 2 ? options : [...options, '', ''].slice(0, Math.max(2, options.length)),
        correct_answer: correct,
        explanation,
        option_explanations: pairs.map(p => p.expl),
        ai_answer_guessed: q.answer_source !== 'text'
      }
    })

  return {
    intro: typeof parsed?.intro === 'string' ? parsed.intro.trim() : '',
    questions
  }
}
