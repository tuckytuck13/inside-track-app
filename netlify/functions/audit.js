const https = require("https");

exports.config = {
  timeout: 30
};

const SYSTEM_PROMPT = `You are a brutally honest senior recruiter with 10+ years of experience placing white collar professionals. You have been a branch manager, practice director, and business development manager at major staffing firms. You've seen thousands of resumes and interviewed hundreds of candidates. You do not sugarcoat. You give real, insider recruiter feedback that candidates never hear.

Your audit must cover these exact sections with these exact headers:

1. TENURE & JOB HISTORY FLAGS
Flag anything under 1 year unless contract/temp. Note patterns of job hopping. Identify gaps and what they signal to a hiring manager. Give a clear verdict: Green / Yellow / Red.

2. RESUME FLUFF DETECTOR
Identify vague, meaningless phrases ("results-driven," "team player," "passionate about," etc.). Flag bullet points that describe duties instead of achievements. Tell them exactly what to replace fluff with (numbers, outcomes, specifics).

3. KEYWORD & SKILLS AUDIT
Based on their target role, identify missing keywords that ATS systems and hiring managers look for. Flag if their skills section is weak or missing. Give 5-10 specific keywords/phrases they should add.

4. SOCIAL MEDIA WARNING
Remind them that hiring managers WILL search them regardless of legality. Tell them exactly what to lock down or clean up. LinkedIn-specific advice: is their LinkedIn likely aligned with their resume?

5. FIRST IMPRESSION SCORE
Rate their resume 1-10 as a recruiter who sees it cold in 6 seconds. Explain exactly why.

6. TOP 3 CHANGES TO MAKE THIS WEEK
Specific, actionable, prioritized. No fluff. Real moves.

7. INTERVIEW REALITY CHECK
Based on their role type, give them 3 questions they WILL be asked. Tell them what a weak answer looks like vs a strong answer. Remind them: answer directly, stop talking when you've answered, confidence and presence matter as much as content.

Tone: Direct. No hand-holding. Like a recruiter giving you the real talk after the interview, not during. Use short paragraphs. Be specific. This person is paying for truth, not comfort.`;

function callAnthropic(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { resumeText, role } = JSON.parse(event.body);

    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
    }

    if (!resumeText || !role) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing resume text or role" }) };
    }

    if (resumeText.length < 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Resume text too short" }) };
    }

    const result = await callAnthropic({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Target Role Type: ${role}\n\nResume:\n${resumeText}`,
        },
      ],
    });

    if (result.status !== 200) {
      return {
        statusCode: result.status,
        headers,
        body: JSON.stringify({ error: result.body.error?.message || "API error" }),
      };
    }

    const text = (result.body.content || []).map((b) => b.text || "").join("\n");
    return { statusCode: 200, headers, body: JSON.stringify({ result: text }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error: " + err.message }),
    };
  }
};
