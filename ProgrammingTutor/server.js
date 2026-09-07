import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Detect class name from Java code
function extractClassName(code) {
  const publicClassMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
  if (publicClassMatch && publicClassMatch[1]) {
    return publicClassMatch[1];
  }
  const anyClassMatch = code.match(/class\s+([A-Za-z0-9_$]+)/);
  if (anyClassMatch && anyClassMatch[1]) {
    return anyClassMatch[1];
  }
  return 'Main';
}

// Fallback: Piston public code execution API
async function executeWithPiston(code, stdin = '') {
  const response = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      version: '15.0.2',
      files: [{ content: code }],
      stdin: stdin || ''
    })
  });

  if (!response.ok) {
    throw new Error(`Piston API returned ${response.status}`);
  }

  const data = await response.json();
  const compile = data.compile || {};
  const run = data.run || {};

  if (compile.code !== 0 && compile.stderr) {
    return {
      success: false,
      phase: 'compile',
      stdout: '',
      stderr: compile.stderr,
      exitCode: compile.code,
      engine: 'piston'
    };
  }

  return {
    success: run.code === 0,
    phase: 'run',
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    exitCode: run.code,
    engine: 'piston'
  };
}

// Local Java compilation and execution
async function executeLocally(code, stdin = '') {
  const className = extractClassName(code);
  const executionId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `javatutor_${executionId}`);
  await fs.mkdir(tempDir, { recursive: true });

  const javaFilePath = path.join(tempDir, `${className}.java`);
  await fs.writeFile(javaFilePath, code, 'utf8');

  const startTime = Date.now();

  try {
    // 1. Compile Phase
    const compileResult = await new Promise((resolve) => {
      const javac = spawn('javac', ['-encoding', 'UTF-8', `${className}.java`], {
        cwd: tempDir,
        timeout: 7000
      });

      let stdout = '';
      let stderr = '';

      javac.stdout.on('data', (d) => { stdout += d.toString(); });
      javac.stderr.on('data', (d) => { stderr += d.toString(); });

      javac.on('error', (err) => {
        resolve({ error: err.message, failedToLaunch: true });
      });

      javac.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    if (compileResult.failedToLaunch) {
      throw new Error(`Local javac failed: ${compileResult.error}`);
    }

    if (compileResult.code !== 0) {
      return {
        success: false,
        phase: 'compile',
        stdout: compileResult.stdout,
        stderr: compileResult.stderr || 'Compilation error occurred.',
        exitCode: compileResult.code,
        executionTime: Date.now() - startTime,
        engine: 'local-jdk'
      };
    }

    // 2. Execution Phase
    const runResult = await new Promise((resolve) => {
      // Memory cap: 128MB, serial GC for low overhead
      const java = spawn('java', ['-Xmx128m', '-XX:+UseSerialGC', className], {
        cwd: tempDir,
        timeout: 6000
      });

      let stdout = '';
      let stderr = '';
      let killedDueToSize = false;

      if (stdin) {
        java.stdin.write(stdin);
        java.stdin.end();
      } else {
        java.stdin.end();
      }

      java.stdout.on('data', (d) => {
        stdout += d.toString();
        if (stdout.length > 50000) {
          killedDueToSize = true;
          java.kill('SIGTERM');
        }
      });

      java.stderr.on('data', (d) => {
        stderr += d.toString();
        if (stderr.length > 20000) {
          killedDueToSize = true;
          java.kill('SIGTERM');
        }
      });

      java.on('error', (err) => {
        resolve({ error: err.message, failedToLaunch: true });
      });

      java.on('close', (code, signal) => {
        if (killedDueToSize) {
          stderr += '\n[System]: Output truncated. Infinite loop or output limit exceeded.';
        }
        if (signal === 'SIGTERM') {
          stderr += '\n[System]: Process timed out after 6 seconds (check for infinite loops or waiting for unprovided input).';
        }
        resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr });
      });
    });

    if (runResult.failedToLaunch) {
      throw new Error(`Local java execution failed: ${runResult.error}`);
    }

    return {
      success: runResult.code === 0,
      phase: 'run',
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.code,
      executionTime: Date.now() - startTime,
      engine: 'local-jdk'
    };
  } finally {
    // Cleanup temporary workspace files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// Compile & Run Route
app.post('/api/compile', async (req, res) => {
  const { code, stdin } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  try {
    // Attempt local execution first
    try {
      const localResult = await executeLocally(code, stdin || '');
      return res.json(localResult);
    } catch (localErr) {
      console.warn('Local execution failed, falling back to Piston API:', localErr.message);
      const pistonResult = await executeWithPiston(code, stdin || '');
      return res.json(pistonResult);
    }
  } catch (err) {
    console.error('Execution failure:', err);
    res.status(500).json({
      success: false,
      phase: 'system',
      stdout: '',
      stderr: `Execution error: ${err.message}`,
      exitCode: 1
    });
  }
});

// AI Tutor Chat Route
app.post('/api/chat', async (req, res) => {
  const { messages, apiKey: userApiKey, model: userModel, codeContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const effectiveApiKey = userApiKey || process.env.GEMINI_API_KEY;
  const targetModel = userModel || 'gemini-2.5-flash';

  const systemInstruction = `You are DukeAI, a world-class, welcoming, and encouraging Java programming tutor designed specifically for beginners.
Your pedagogical mission:
1. Explain concepts simply and intuitively using relatable real-world analogies (e.g., variables are labeled boxes, loops are repeating musical tracks, classes are cookie cutters and objects are cookies).
2. Never dump dry theory without showing a clear, runnable code example.
3. Keep code snippets beginner-friendly, clean, well-formatted, and contained in a single class with a main method when runnable.
4. When explaining compiler or runtime errors, breakdown:
   - What the error literally means in plain English.
   - Which line triggered it.
   - The exact fix, accompanied by an explanation of why the fix works.
5. If the user shares their current code, reference their specific variable names and line numbers.
6. Provide short check-for-understanding questions or mini-challenges to reinforce learning.
7. Use Markdown formatting with bolding, bullet points, and syntax-highlighted java code blocks (\`\`\`java).`;

  // If API key is available, call Gemini API
  if (effectiveApiKey) {
    try {
      const contents = [];

      // Format messages for Gemini API
      for (const msg of messages) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }

      // Inject code context if provided
      if (codeContext && contents.length > 0) {
        const lastMsg = contents[contents.length - 1];
        if (lastMsg.role === 'user') {
          lastMsg.parts[0].text = `[Current Java Code in Student Editor]:\n\`\`\`java\n${codeContext}\n\`\`\`\n\nStudent Question / Message: ${lastMsg.parts[0].text}`;
        }
      }

      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${effectiveApiKey}`;

      const response = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API Error Response:', errorText);
        return res.status(response.status).json({
          error: `AI Service Error (${response.status}): ${errorText}`
        });
      }

      const data = await response.json();
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response. Please try again.';

      return res.json({ reply: replyText, model: targetModel, provider: 'gemini' });
    } catch (apiErr) {
      console.error('AI Request Error:', apiErr);
      return res.status(500).json({ error: `AI request failed: ${apiErr.message}` });
    }
  }

  // Fallback: Smart Built-in Tutor Engine (Works seamlessly offline or without key)
  const lastUserMsg = messages[messages.length - 1]?.content || '';
  const fallbackReply = generatePedagogicalFallback(lastUserMsg, codeContext);

  return res.json({
    reply: fallbackReply,
    model: 'built-in-pedagogical-engine',
    provider: 'offline',
    isOfflineFallback: true
  });
});

// Built-in Pedagogical Tutor Engine for instant zero-config learning
function generatePedagogicalFallback(prompt, codeContext = '') {
  const p = prompt.toLowerCase();

  if (p.includes('explain') && (p.includes('error') || p.includes('exception') || p.includes('bug'))) {
    return `### 🔍 Error Diagnosis & Fix

When encountering Java errors, remember: **compiler errors are your best friend!** They stop bugs before your program ever runs.

Common beginner errors to check:
1. **Missing Semicolon (\`;\`)**: Every standalone statement in Java must end with \`;\`.
2. **Cannot find symbol**: You might have a typo in a variable name or forgot to declare its type (like \`int x = 5;\`).
3. **Class name mismatch**: In standard Java, your file name must match the \`public class\` name (e.g. \`public class Main\` goes in \`Main.java\`).
4. **Mismatched curly braces (\`{}\`)**: Make sure every opening brace \`{\` has a matching closing brace \`}\`.

> 💡 **Tip**: Click the **"Run Code"** button above. If an error appears in the terminal below, click **"Ask Duke AI to Diagnose"** to get an instant breakdown!

Would you like me to walk through the exact line causing the problem?`;
  }

  if (p.includes('variable') || p.includes('data type') || p.includes('int') || p.includes('string')) {
    return `### 📦 Understanding Java Variables & Data Types

Think of a **variable** as a labeled storage box in your computer's memory. When you create one, you must tell Java two things:
1. **The Type** (what kind of data fits inside the box)
2. **The Name** (the label on the box)

\`\`\`java
public class Main {
    public static void main(String[] args) {
        // 1. Whole numbers (int)
        int studentAge = 19;

        // 2. Decimal numbers (double)
        double gpa = 3.85;

        // 3. True / False (boolean)
        boolean lovesCoding = true;

        // 4. Single character (char - single quotes!)
        char grade = 'A';

        // 5. Text / Words (String - double quotes!)
        String name = "Alex";

        System.out.println("Student: " + name);
        System.out.println("Age: " + studentAge + " | GPA: " + gpa);
        System.out.println("Grade: " + grade + " | Loves coding: " + lovesCoding);
    }
}
\`\`\`

#### Quick Check 🎯
What happens if you try to assign \`int age = "nineteen";\`? 
*Java's compiler will stop you!* Because \`int\` only accepts numeric integers, not String text. This is called **static typing**, and it protects your code from unexpected bugs.

Try loading the code into the editor above and pressing **Run Code**!`;
  }

  if (p.includes('loop') || p.includes('for') || p.includes('while')) {
    return `### 🔁 Java Loops: Automating Repetition

Instead of writing \`System.out.println("Hello");\` ten times, we use **loops**!

#### 1. The Classic \`for\` Loop
Best when you know **how many times** you want to repeat something:
\`\`\`java
public class Main {
    public static void main(String[] args) {
        // (start; condition; update)
        for (int i = 1; i <= 5; i++) {
            System.out.println("Countdown: " + i);
        }
        System.out.println("Blast off! 🚀");
    }
}
\`\`\`

#### 2. The \`while\` Loop
Best when you want to repeat **until a condition changes**:
\`\`\`java
public class Main {
    public static void main(String[] args) {
        int energy = 3;
        while (energy > 0) {
            System.out.println("Coding in progress... Energy: " + energy);
            energy--; // Don't forget to decrement, or it loops forever!
        }
        System.out.println("Time for coffee! ☕");
    }
}
\`\`\`

**Mini Challenge**: Try altering the loop in the editor to count backwards from 10 down to 1!`;
  }

  if (p.includes('oop') || p.includes('class') || p.includes('object')) {
    return `### 🏗️ Object-Oriented Programming (OOP) in Java

Java is centered around **Classes** and **Objects**. Here is the easiest mental model:

* **The Class** is the **Blueprint** (or cookie cutter). It defines what properties and behaviors exist.
* **The Object** is the **Actual House** (or cookie) built from that blueprint.

\`\`\`java
// Blueprint
class Robot {
    // 1. Attributes (State / Fields)
    String name;
    int batteryLevel;

    // 2. Constructor (How we build a Robot)
    public Robot(String robotName, int battery) {
        name = robotName;
        batteryLevel = battery;
    }

    // 3. Methods (Behaviors / Actions)
    public void speak() {
        System.out.println("Beep boop! I am " + name + " with " + batteryLevel + "% battery.");
    }
}

public class Main {
    public static void main(String[] args) {
        // Creating two distinct Objects from the Robot blueprint:
        Robot r1 = new Robot("R2-D2", 95);
        Robot r2 = new Robot("Wall-E", 40);

        r1.speak();
        r2.speak();
    }
}
\`\`\`

Notice how each robot has its own independent state! Try copying this code into the editor to create your own custom robot!`;
  }

  if (p.includes('quiz')) {
    return `### 🧠 Quick Java Beginner Quiz!

Let's test your Java instincts! Look at this snippet:

\`\`\`java
int x = 10;
int y = 3;
System.out.println(x / y);
\`\`\`

**What will this print?**
- **A)** \`3.33333333\`
- **B)** \`3\`
- **C)** \`3.0\`
- **D)** Compilation Error

*(Hint: Think about what happens when both numbers in division are \`int\` types!)*
Reply with your answer and I'll explain what's happening under the hood!`;
  }

  // General beginner greeting / guidance
  return `### 👋 Welcome to Java Programming!

I'm **DukeAI**, your interactive Java tutor. Whether you've never written a line of code or you're brushing up on Object-Oriented principles, I'm here to guide you step-by-step!

Here are some great ways to start right now:
1. 📚 **Select a Lesson** from the **Lessons** dropdown above (e.g. *Variables*, *Loops*, or *OOP*).
2. 🚀 **Run the Editor Code** using **Ctrl + Enter** (or the glowing **Run Code** button) to see instant output in the console.
3. 💬 **Ask me anything!** Try asking:
   - *"Explain how if-else works with an example"*
   - *"What is public static void main?"*
   - *"Give me a beginner practice challenge"*
   - *"Quiz me on loops"*

*(💡 Optional: Click the **⚙ Settings** button in the header if you'd like to add a Gemini API key for unlimited AI chat capability!)*`;
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Java Programming Tutor Server running!`);
  console.log(`👉 Access website at: http://localhost:${PORT}`);
  console.log(`==============================================\n`);
});
