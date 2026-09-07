import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
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

// Helper: Call Google Gemini REST API with fallback models
async function callGeminiApi(apiKey, model, systemInstruction, contents) {
  const candidateModels = [
    model,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash-lite'
  ];

  const modelsToTry = [...new Set(candidateModels.filter(Boolean))];
  let lastError = null;

  for (const targetModel of modelsToTry) {
    for (const apiVersion of ['v1beta', 'v1']) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${targetModel}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2000
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            return { reply: replyText, model: `${targetModel} (${apiVersion})` };
          }
        } else {
          const errorText = await response.text();
          let parsed;
          try { parsed = JSON.parse(errorText); } catch { parsed = { error: { message: errorText } }; }
          lastError = new Error(`Gemini API [${targetModel} ${apiVersion}] (${response.status}): ${parsed.error?.message || errorText}`);
          if (response.status === 403 || response.status === 400) {
            throw lastError;
          }
        }
      } catch (err) {
        lastError = err;
        if (err.message.includes('403') || err.message.includes('denied') || err.message.includes('API_KEY_INVALID')) {
          throw err;
        }
      }
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.');
}

// AI Tutor Chat Route
app.post('/api/chat', async (req, res) => {
  const { messages, apiKey: userApiKey, model: userModel, codeContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const effectiveApiKey = (userApiKey && userApiKey.trim()) || process.env.GEMINI_API_KEY || '';
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
5. If the student provides Java code from their editor, reference their exact variable names, method names, and line numbers.
6. Provide short check-for-understanding questions or mini-challenges to reinforce learning.
7. Use Markdown formatting with bolding, bullet points, and syntax-highlighted java code blocks (\`\`\`java).`;

  // If API key is provided and looks plausible (length >= 25)
  if (effectiveApiKey && effectiveApiKey.length >= 25) {
    try {
      // Clean and normalize messages for Gemini API
      const normalizedContents = [];
      let foundFirstUser = false;

      for (const msg of messages) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        if (!foundFirstUser) {
          if (role === 'user') {
            foundFirstUser = true;
          } else {
            continue; // Skip initial assistant greeting
          }
        }

        if (normalizedContents.length > 0 && normalizedContents[normalizedContents.length - 1].role === role) {
          normalizedContents[normalizedContents.length - 1].parts[0].text += `\n\n${msg.content}`;
        } else {
          normalizedContents.push({
            role,
            parts: [{ text: msg.content }]
          });
        }
      }

      if (normalizedContents.length === 0) {
        const lastUser = messages.filter(m => m.role === 'user').pop();
        normalizedContents.push({
          role: 'user',
          parts: [{ text: lastUser?.content || 'Hello DukeAI! Help me learn Java.' }]
        });
      }

      // Inject code context into the latest user message
      if (codeContext && codeContext.trim()) {
        const lastTurn = normalizedContents[normalizedContents.length - 1];
        if (lastTurn && lastTurn.role === 'user') {
          lastTurn.parts[0].text = `[Student Editor Java Code]:\n\`\`\`java\n${codeContext}\n\`\`\`\n\n[Student Question/Input]:\n${lastTurn.parts[0].text}`;
        }
      }

      const result = await callGeminiApi(effectiveApiKey, targetModel, systemInstruction, normalizedContents);
      return res.json({
        reply: result.reply,
        model: result.model,
        provider: 'gemini',
        isOfflineFallback: false
      });
    } catch (apiErr) {
      console.warn('Gemini API call failed, using pedagogical engine:', apiErr.message);
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const fallbackReply = generatePedagogicalFallback(lastUserMsg, codeContext);
      return res.json({
        reply: fallbackReply,
        model: 'duke-pedagogical-v2',
        provider: 'offline-fallback',
        isOfflineFallback: true
      });
    }
  }

  // Fallback: Smart Built-in Pedagogical Tutor Engine (Offline / Zero-Config)
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const fallbackReply = generatePedagogicalFallback(lastUserMsg, codeContext);

  return res.json({
    reply: fallbackReply,
    model: 'duke-pedagogical-v2',
    provider: 'offline',
    isOfflineFallback: true
  });
});

// Comprehensive Built-in Pedagogical Tutor Engine
function generatePedagogicalFallback(prompt, codeContext = '') {
  const p = prompt.toLowerCase().trim();

  // 1. Error Diagnosis
  if (p.includes('error') || p.includes('exception') || p.includes('diagnose') || p.includes('fail') || p.includes('bug') || p.includes('fix')) {
    let specificCause = '';
    if (prompt.includes('; expected') || p.includes('semicolon')) {
      specificCause = `\n- **Cause**: A statement is missing a closing semicolon (\`;\`). Java requires every statement to conclude with a semicolon.`;
    } else if (prompt.includes('cannot find symbol') || p.includes('symbol')) {
      specificCause = `\n- **Cause**: Java cannot find a variable or method you referenced. Check for typos in variable names, or ensure you declared the variable with its type (e.g. \`int myVar = 10;\`).`;
    } else if (prompt.includes('class') && prompt.includes('public')) {
      specificCause = `\n- **Cause**: The \`public class\` name must match the filename. Ensure your class is named \`public class Main\`.`;
    }

    return `### 🔍 DukeAI Error Diagnosis & Fix
${specificCause}

Here is a step-by-step checklist to resolve this:
1. **Locate the line**: In the console below, look for the line number (e.g., \`Main.java:4\`). You can click the line link to jump directly to it in the editor.
2. **Braces & Semicolons**: Verify that every opening brace \`{\` has a matching closing brace \`}\` and every line ends with \`;\`.
3. **Data Types**: Check that variables are assigned compatible types (e.g. don't assign a String to an \`int\`).

\`\`\`java
public class Main {
    public static void main(String[] args) {
        // Correct syntax example:
        int score = 100; // note the semicolon!
        System.out.println("Score: " + score);
    }
}
\`\`\`

Press **Run Code (Ctrl+Enter)** after making the fix! Would you like me to rewrite the snippet for you?`;
  }

  // 2. Explain Current Code in Editor
  if (p.includes('explain') && (p.includes('code') || p.includes('current') || p.includes('editor') || p.includes('my'))) {
    if (codeContext && codeContext.trim().length > 10) {
      // Analyze the code dynamically
      const hasScanner = codeContext.includes('Scanner');
      const hasLoops = codeContext.includes('for ') || codeContext.includes('while ') || codeContext.includes('for(');
      const hasIf = codeContext.includes('if ') || codeContext.includes('if(');
      const hasClass = codeContext.includes('class ') && !codeContext.includes('class Main');
      const hasArray = codeContext.includes('[]') || codeContext.includes('Array');

      let breakdown = [];
      breakdown.push(`- **Class & Entry Point**: \`public class Main\` houses the program, and \`public static void main(String[] args)\` is where Java starts executing.`);
      
      if (hasScanner) {
        breakdown.push(`- **User Input**: Uses \`Scanner\` to read input from the keyboard (stdin).`);
      }
      if (hasIf) {
        breakdown.push(`- **Decision Making**: Uses \`if / else\` conditionals to test boolean conditions and branch execution.`);
      }
      if (hasLoops) {
        breakdown.push(`- **Repetition**: Contains loops to automate repetitive operations without writing duplicate lines.`);
      }
      if (hasArray) {
        breakdown.push(`- **Data Storage**: Uses an **Array** to hold multiple values under a single name.`);
      }
      if (hasClass) {
        breakdown.push(`- **Custom Objects (OOP)**: Defines a custom class to model real-world attributes and methods.`);
      }

      return `### 💡 Line-by-Line Code Breakdown

Here is what your current editor code is doing:

${breakdown.join('\n')}

#### How It Executes:
When you click **Run Code**, Java compiles your code into bytecode, then the JVM executes instructions inside \`main\` sequentially from top to bottom.

Try tweaking a value or adding a new \`System.out.println()\` to see how the console output changes!`;
    }
  }

  // 3. Variables & Data Types
  if (p.includes('variable') || p.includes('data type') || p.includes('primitive') || p.includes('data types') || p.startsWith('what is int') || p.startsWith('what is double') || p.startsWith('what is string') || p.startsWith('what is boolean')) {
    return `### 📦 Java Variables & Data Types

In Java, every variable has a **Type** (what fits inside) and a **Name** (the label on the box).

#### The 5 Essential Types for Beginners:
1. \`int\`: Whole numbers without decimals (\`int count = 5;\`)
2. \`double\`: Fractional / decimal numbers (\`double price = 19.99;\`)
3. \`boolean\`: Logical truth value: either \`true\` or \`false\`
4. \`char\`: A single character inside single quotes (\`char letter = 'A';\`)
5. \`String\`: Text inside double quotes (\`String name = "Duke";\`)

\`\`\`java
public class Main {
    public static void main(String[] args) {
        String language = "Java";
        int releaseYear = 1995;
        double speedRating = 9.8;
        boolean isFun = true;

        System.out.println(language + " was created in " + releaseYear);
        System.out.println("Speed Rating: " + speedRating + "/10");
        System.out.println("Is it fun to learn? " + isFun);
    }
}
\`\`\`

> 🧠 **Remember**: Java is **statically typed**. Once you declare \`int x = 10;\`, you cannot assign text to it like \`x = "hello";\`. This prevents bugs before your code even runs!`;
  }

  // 4. Loops (For, While, Do-While)
  if (p.includes('loop') || p.includes('for') || p.includes('while') || p.includes('repeat') || p.includes('iteration')) {
    return `### 🔁 Java Loops: For vs. While

Loops automate repetition so you don't have to copy-paste code.

#### 1. The \`for\` Loop (When you know the count)
\`\`\`java
public class Main {
    public static void main(String[] args) {
        // (initialization; condition; increment)
        for (int i = 1; i <= 5; i++) {
            System.out.println("Loop iteration #" + i);
        }
    }
}
\`\`\`

#### 2. The \`while\` Loop (When repeating until a condition changes)
\`\`\`java
public class Main {
    public static void main(String[] args) {
        int battery = 3;
        while (battery > 0) {
            System.out.println("Robot working... Battery: " + battery);
            battery--; // Always update the variable to avoid infinite loops!
        }
        System.out.println("Recharge needed! ⚡");
    }
}
\`\`\`

**Quick Challenge**: Try creating a loop that prints even numbers from 2 to 10!`;
  }

  // 5. Conditionals (If-Else, Switch)
  if (p.includes('if') || p.includes('else') || p.includes('condition') || p.includes('switch') || p.includes('decision')) {
    return `### 🔀 Decision Making: If, Else If, Else

Conditionals allow your code to make intelligent decisions:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        int temperature = 75;

        if (temperature > 85) {
            System.out.println("It's hot outside! Stay hydrated. ☀️");
        } else if (temperature >= 65) {
            System.out.println("Pleasant weather for coding outdoors! 🌤️");
        } else {
            System.out.println("Chilly! Grab a warm sweater. ❄️");
        }
    }
}
\`\`\`

#### Useful Comparison Operators:
- \`==\` Equal to (e.g. \`x == 5\`)
- \`!=\` Not equal to
- \`>\` and \`<\` Greater / Less than
- \`&&\` AND (both must be true)
- \`||\` OR (at least one must be true)`;
  }

  // 6. User Input with Scanner
  if (p.includes('scanner') || p.includes('input') || p.includes('read') || p.includes('keyboard')) {
    return `### ⌨️ Reading Input with Java Scanner

To read input from the keyboard, use the \`Scanner\` class from \`java.util\`:

\`\`\`java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 1. Create a Scanner attached to System.in
        Scanner scanner = new Scanner(System.in);

        System.out.print("What is your name? ");
        String name = scanner.nextLine();

        System.out.print("How many years have you coded? ");
        int years = scanner.nextInt();

        System.out.println("Welcome, " + name + "! You have " + years + " years experience.");

        scanner.close();
    }
}
\`\`\`

> 💡 **Tip for our Studio**: When testing \`Scanner\` code in DukeAI Studio, open the **Stdin** drawer in the terminal bar below and enter your inputs line by line!`;
  }

  // 7. Methods and Functions
  if (p.includes('method') || p.includes('function') || p.includes('parameter') || p.includes('return') || p.includes('void')) {
    return `### 🛠️ Java Methods (Functions)

Methods are reusable recipes of code that do a specific task. They prevent code duplication.

\`\`\`java
public class Main {
    // 1. A method that takes inputs (parameters) and returns a result:
    public static int multiply(int a, int b) {
        return a * b;
    }

    // 2. A 'void' method that simply performs an action:
    public static void greetUser(String username) {
        System.out.println("Hello, " + username + "! Ready to code?");
    }

    public static void main(String[] args) {
        greetUser("Alex");

        int product = multiply(6, 7);
        System.out.println("6 x 7 = " + product);
    }
}
\`\`\`

- **\`void\`**: Means the method does not return a value.
- **\`static\`**: Means you can call it directly from \`main\` without creating an object.`;
  }

  // 8. Arrays and Lists
  if (p.includes('array') || p.includes('list') || p.includes('collection')) {
    return `### 📚 Arrays in Java

An **Array** stores multiple values of the same type in a single variable:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        // Declaring and initializing an array of strings
        String[] fruits = { "Apple", "Banana", "Orange", "Mango" };

        // Accessing by 0-based index:
        System.out.println("First fruit: " + fruits[0]); // Apple
        System.out.println("Total fruits: " + fruits.length);

        // Printing every fruit with a modern for-each loop:
        System.out.println("\nAll Fruits:");
        for (String fruit : fruits) {
            System.out.println("• " + fruit);
        }
    }
}
\`\`\`

> ⚠️ Remember: Arrays in Java have a **fixed size**. Once created, their length cannot change!`;
  }

  // 9. Object-Oriented Programming (OOP)
  if (p.includes('oop') || p.includes('class') || p.includes('object') || p.includes('constructor') || p.includes('this') || p.includes('inheritance')) {
    return `### 🏛️ Object-Oriented Programming (OOP)

In Java, everything revolves around **Classes** and **Objects**:
- **Class**: The **Blueprint** (e.g., blueprints for a House or Car).
- **Object**: The **Actual Instance** built from the blueprint.

\`\`\`java
// 1. The Blueprint Class
class BankAccount {
    String accountHolder;
    double balance;

    // Constructor: initializes new accounts
    public BankAccount(String name, double initialDeposit) {
        accountHolder = name;
        balance = initialDeposit;
    }

    // Method: behavior
    public void deposit(double amount) {
        balance += amount;
        System.out.println(accountHolder + " deposited $" + amount + ". New balance: $" + balance);
    }
}

public class Main {
    public static void main(String[] args) {
        // Creating two independent objects
        BankAccount acc1 = new BankAccount("Alice", 250.0);
        BankAccount acc2 = new BankAccount("Bob", 100.0);

        acc1.deposit(50.0);
        acc2.deposit(75.0);
    }
}
\`\`\`

Click **Insert to Editor** to run this banking system!`;
  }

  // 10. Beginner Projects (Calculator, Games, etc.)
  if (p.includes('calculator') || p.includes('project') || p.includes('build') || p.includes('game')) {
    return `### 🧮 Project: Java Console Calculator

Here is a complete, beginner-friendly calculator project you can run right now:

\`\`\`java
public class Main {
    public static void calculate(double num1, double num2, char operator) {
        double result = 0;
        boolean valid = true;

        switch (operator) {
            case '+': result = num1 + num2; break;
            case '-': result = num1 - num2; break;
            case '*': result = num1 * num2; break;
            case '/': 
                if (num2 != 0) {
                    result = num1 / num2; 
                } else {
                    System.out.println("Error: Cannot divide by zero!");
                    valid = false;
                }
                break;
            default:
                System.out.println("Invalid operator: " + operator);
                valid = false;
        }

        if (valid) {
            System.out.println(num1 + " " + operator + " " + num2 + " = " + result);
        }
    }

    public static void main(String[] args) {
        System.out.println("=== DukeAI Java Calculator ===");
        calculate(15, 5, '+');
        calculate(20, 4, '-');
        calculate(7, 8, '*');
        calculate(100, 4, '/');
    }
}
\`\`\`

Click **Insert to Editor** and press **Run Code** to try it!`;
  }

  // 11. Fibonacci Series
  if (p.includes('fibonacci') || p.includes('fib')) {
    return `### 🌀 The Fibonacci Series in Java

The **Fibonacci sequence** is a mathematical sequence where every number is the sum of the two preceding ones:
$$\\mathbf{0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, ...}$$

#### 💡 The Intuition
- Term 1: \`0\`
- Term 2: \`1\`
- Term 3: \`0 + 1 = 1\`
- Term 4: \`1 + 1 = 2\`
- Term 5: \`1 + 2 = 3\`
- Term 6: \`2 + 3 = 5\`

---

### 💻 Complete Runnable Java Code (Iterative)

\`\`\`java
public class Main {
    public static void main(String[] args) {
        int n = 10; // Number of Fibonacci numbers to print

        int first = 0;
        int second = 1;

        System.out.println("--- First " + n + " Fibonacci Numbers ---");

        for (int i = 1; i <= n; i++) {
            System.out.print(first + " ");

            // Calculate next number
            int next = first + second;

            // Slide terms forward for next iteration
            first = second;
            second = next;
        }

        System.out.println(); // New line
    }
}
\`\`\`

---

### 🔍 How It Works:
1. **Initialize**: We start with \`first = 0\` and \`second = 1\`.
2. **Loop \`n\` times**: Each time through the \`for\` loop, we print \`first\`.
3. **Calculate & Shift**:
   - \`int next = first + second;\` (computes sum).
   - \`first = second;\` (the old second number becomes our new first).
   - \`second = next;\` (the sum becomes our new second).

> 🚀 Click **"Insert to Editor"** and press **Run Code (Ctrl+Enter)** to see the output right now!

**Bonus Challenge**: Can you modify the program to only print Fibonacci numbers up to 100?`;
  }

  // 12. Factorial
  if (p.includes('factorial')) {
    return `### ❗ Factorial of a Number in Java

The **factorial** of a non-negative integer $n$ (written as $n!$) is the product of all positive integers less than or equal to $n$:
$$5! = 5 \\times 4 \\times 3 \\times 2 \\times 1 = 120$$

\`\`\`java
public class Main {
    public static long calculateFactorial(int n) {
        long result = 1;
        for (int i = 1; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    public static void main(String[] args) {
        int num = 5;
        System.out.println("The factorial of " + num + "! is: " + calculateFactorial(num));
        
        // Testing another number
        System.out.println("7! = " + calculateFactorial(7));
    }
}
\`\`\`

> 💡 **Notice**: We use \`long\` instead of \`int\` because factorials grow extremely fast and can easily overflow a standard 32-bit \`int\`!`;
  }

  // 13. Prime Numbers
  if (p.includes('prime')) {
    return `### 🔢 Prime Number Checker in Java

A **prime number** is a whole number greater than 1 whose only divisors are 1 and itself (e.g. 2, 3, 5, 7, 11, 13, 17, 19...).

\`\`\`java
public class Main {
    public static boolean isPrime(int n) {
        // Numbers <= 1 are not prime
        if (n <= 1) return false;

        // Check divisors up to square root of n (optimized)
        for (int i = 2; i <= Math.sqrt(n); i++) {
            if (n % i == 0) {
                return false; // Found a factor! Not prime.
            }
        }
        return true;
    }

    public static void main(String[] args) {
        int[] testNumbers = { 2, 15, 29, 49, 97 };

        for (int num : testNumbers) {
            if (isPrime(num)) {
                System.out.println(num + " is a PRIME number! ⭐");
            } else {
                System.out.println(num + " is a composite number.");
            }
        }
    }
}
\`\`\`

**Why \`Math.sqrt(n)\`?**
If a number has a factor larger than its square root, it must also have a matching factor smaller than its square root. Stopping at $\\sqrt{n}$ makes the algorithm much faster!`;
  }

  // 14. Palindrome Checker
  if (p.includes('palindrome')) {
    return `### 🔄 Palindrome Checker in Java

A **palindrome** is a word, phrase, or number that reads identical forwards and backwards (e.g. \`"racecar"\`, \`"level"\`, \`12321\`).

\`\`\`java
public class Main {
    public static boolean isPalindrome(String str) {
        String clean = str.toLowerCase();
        int left = 0;
        int right = clean.length() - 1;

        while (left < right) {
            if (clean.charAt(left) != clean.charAt(right)) {
                return false; // Mismatch found
            }
            left++;
            right--;
        }
        return true;
    }

    public static void main(String[] args) {
        String word1 = "racecar";
        String word2 = "java";

        System.out.println("Is '" + word1 + "' a palindrome? " + isPalindrome(word1));
        System.out.println("Is '" + word2 + "' a palindrome? " + isPalindrome(word2));
    }
}
\`\`\`

Click **Insert to Editor** and run it!`;
  }

  // 15. Reverse String / Array / Number
  if (p.includes('reverse')) {
    return `### ⏪ Reversing Data in Java

#### 1. Reversing a String:
\`\`\`java
public class Main {
    public static String reverseString(String text) {
        StringBuilder reversed = new StringBuilder();
        for (int i = text.length() - 1; i >= 0; i--) {
            reversed.append(text.charAt(i));
        }
        return reversed.toString();
    }

    public static void main(String[] args) {
        String original = "Hello DukeAI";
        System.out.println("Original: " + original);
        System.out.println("Reversed: " + reverseString(original));
    }
}
\`\`\`

You can also use Java's built-in helper: \`new StringBuilder(text).reverse().toString();\`!`;
  }

  // 16. Star Patterns
  if (p.includes('pattern') || p.includes('star') || p.includes('pyramid') || p.includes('triangle')) {
    return `### ⭐ Java Star Pyramid & Patterns

Patterns are the best way to master **nested loops**:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        int rows = 5;

        System.out.println("--- Right Triangle Pattern ---");
        for (int i = 1; i <= rows; i++) {
            for (int j = 1; j <= i; j++) {
                System.out.print("⭐ ");
            }
            System.out.println();
        }

        System.out.println("\n--- Centered Pyramid ---");
        for (int i = 1; i <= rows; i++) {
            // Print leading spaces
            for (int s = 1; s <= rows - i; s++) {
                System.out.print("  ");
            }
            // Print stars
            for (int j = 1; j <= (2 * i - 1); j++) {
                System.out.print("⭐");
            }
            System.out.println();
        }
    }
}
\`\`\`

Click **Insert to Editor** to see the pyramid printed!`;
  }

  // 17. Recursion
  if (p.includes('recursion') || p.includes('recursive')) {
    return `### 🪞 Understanding Recursion in Java

**Recursion** is when a method calls itself to solve a smaller piece of the same problem. Every recursive method MUST have:
1. **Base Case**: When to stop (prevents infinite loop \`StackOverflowError\`).
2. **Recursive Step**: The call to itself with a smaller input.

\`\`\`java
public class Main {
    // Recursive countdown
    public static void countdown(int n) {
        // 1. Base case
        if (n <= 0) {
            System.out.println("Blastoff! 🚀");
            return;
        }

        // 2. Action
        System.out.println(n + "...");

        // 3. Recursive call with smaller value
        countdown(n - 1);
    }

    public static void main(String[] args) {
        countdown(5);
    }
}
\`\`\`

Try running it in the editor!`;
  }

  // 18. Sorting & Searching (Bubble Sort, Binary Search)
  if (p.includes('sort') || p.includes('search') || p.includes('bubble') || p.includes('binary search')) {
    return `### 📶 Searching & Sorting in Java

#### Bubble Sort Example:
\`\`\`java
import java.util.Arrays;

public class Main {
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    // Swap arr[j] and arr[j+1]
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }

    public static void main(String[] args) {
        int[] numbers = { 64, 34, 25, 12, 22, 11, 90 };
        System.out.println("Unsorted: " + Arrays.toString(numbers));

        bubbleSort(numbers);

        System.out.println("Sorted:   " + Arrays.toString(numbers));
    }
}
\`\`\`

Click **Insert to Editor** to run the sort!`;
  }

  // 19. Quizzes
  if (p.includes('quiz') || p.includes('test') || p.includes('question')) {
    return `### 🧠 Java Beginner Quiz!

**Question**: What is the output of the following Java code?

\`\`\`java
int a = 7;
int b = 2;
System.out.println(a / b);
\`\`\`

- **A)** \`3.5\`
- **B)** \`3\`
- **C)** \`4\`
- **D)** Runtime Exception

*(Think carefully about what happens when you divide two integers in Java! Reply with your letter choice and I will explain!)*`;
  }

  // Fallback: Dynamic programmatic explanation synthesizing Java code for any prompt
  const cleanSubject = prompt.replace(/[?.,!]/g, '').trim();
  return `### ☕ Java Guide: ${cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1)}

Here is how you can understand and implement **${cleanSubject}** in Java:

\`\`\`java
public class Main {
    public static void main(String[] args) {
        // Demonstration of ${cleanSubject} in Java
        System.out.println("--- Understanding ${cleanSubject} ---");
        
        // Example implementation:
        String topic = "${cleanSubject}";
        System.out.println("Exploring: " + topic);
        
        for (int step = 1; step <= 3; step++) {
            System.out.println("Step " + step + ": Executing logic for " + topic);
        }
        
        System.out.println("Execution complete!");
    }
}
\`\`\`

#### Key Takeaways for Beginners:
1. Java is **strictly typed**: Always define whether your variables are \`int\`, \`double\`, \`boolean\`, or \`String\`.
2. Every standalone instruction must end with a semicolon (\`;\`).
3. Code execution begins inside \`public static void main(String[] args)\`.

> 💡 *Want full freeform AI conversations?* You can create a new free Google Gemini API key at [Google AI Studio ↗](https://aistudio.google.com/app/apikey) and paste it into **⚙ Settings**!

Would you like me to tailor this code into a specific example or project?`;
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Java Programming Tutor Server running!`);
  console.log(`👉 Access website at: http://localhost:${PORT}`);
  console.log(`==============================================\n`);
});
