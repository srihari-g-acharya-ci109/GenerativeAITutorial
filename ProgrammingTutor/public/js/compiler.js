// Compiler & Execution Terminal Controller

export class CompilerController {
  constructor(editorInstance, tutorController) {
    this.editor = editorInstance;
    this.tutor = tutorController;

    this.terminalOutput = document.getElementById('terminalOutput');
    this.terminalStatus = document.getElementById('terminalStatus');
    this.terminalMeta = document.getElementById('terminalMeta');
    this.runBtn = document.getElementById('runBtn');
    this.clearBtn = document.getElementById('clearConsoleBtn');
    this.stdinInput = document.getElementById('stdinInput');
    this.stdinDrawer = document.getElementById('stdinDrawer');
    this.toggleStdinBtn = document.getElementById('toggleStdinBtn');

    this.isRunning = false;
    this.initEventListeners();
  }

  initEventListeners() {
    this.runBtn.addEventListener('click', () => this.runCode());
    this.clearBtn.addEventListener('click', () => this.clearTerminal());

    if (this.toggleStdinBtn) {
      this.toggleStdinBtn.addEventListener('click', () => {
        this.stdinDrawer.classList.toggle('open');
        this.toggleStdinBtn.classList.toggle('active');
        if (this.stdinDrawer.classList.contains('open')) {
          this.stdinInput.focus();
        }
      });
    }

    // Ctrl+Enter or Cmd+Enter to run code
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.runCode();
      }
    });
  }

  clearTerminal() {
    this.terminalOutput.innerHTML = `<div class="terminal-placeholder">
      <span class="pulse-dot"></span>
      Console ready. Press <strong>Run Code (Ctrl+Enter)</strong> to compile and execute Java code.
    </div>`;
    this.terminalStatus.className = 'status-indicator idle';
    this.terminalStatus.textContent = 'Idle';
    this.terminalMeta.textContent = '';
  }

  setRunningState(running) {
    this.isRunning = running;
    if (running) {
      this.runBtn.classList.add('loading');
      this.runBtn.setAttribute('disabled', 'true');
      this.terminalStatus.className = 'status-indicator running';
      this.terminalStatus.textContent = 'Compiling & Running...';
    } else {
      this.runBtn.classList.remove('loading');
      this.runBtn.removeAttribute('disabled');
    }
  }

  async runCode() {
    if (this.isRunning) return;

    const code = this.editor.getValue();
    if (!code || !code.trim()) {
      this.renderOutput({
        stderr: '[System Error]: Editor is empty. Please write some Java code first!',
        exitCode: 1,
        phase: 'system'
      });
      return;
    }

    const stdin = this.stdinInput ? this.stdinInput.value : '';

    this.setRunningState(true);
    this.terminalOutput.innerHTML = `
      <div class="terminal-executing">
        <div class="spinner"></div>
        <span>Compiling Java source via JDK 21...</span>
      </div>
    `;

    const startTime = performance.now();

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin })
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}: Execution failed`);
      }

      const result = await response.json();
      result.executionTime = result.executionTime || elapsed;
      this.renderOutput(result, code);
    } catch (err) {
      this.renderOutput({
        stderr: `[Network or Server Error]: ${err.message}\nMake sure the local server is running.`,
        exitCode: 1,
        phase: 'network'
      }, code);
    } finally {
      this.setRunningState(false);
    }
  }

  renderOutput(result, code) {
    this.terminalOutput.innerHTML = '';

    const hasStdout = Boolean(result.stdout && result.stdout.trim());
    const hasStderr = Boolean(result.stderr && result.stderr.trim());

    if (result.success) {
      this.terminalStatus.className = 'status-indicator success';
      this.terminalStatus.textContent = 'Success (Exit 0)';
    } else {
      this.terminalStatus.className = 'status-indicator error';
      this.terminalStatus.textContent = result.phase === 'compile' ? 'Compilation Failed' : 'Runtime Error';
    }

    const timeStr = result.executionTime ? `${result.executionTime}ms` : '';
    const engineStr = result.engine === 'local-jdk' ? 'Local JDK 21' : (result.engine === 'piston' ? 'Cloud Piston' : '');
    this.terminalMeta.textContent = [engineStr, timeStr].filter(Boolean).join(' • ');

    // Standard Output block
    if (hasStdout) {
      const outBlock = document.createElement('pre');
      outBlock.className = 'output-stdout';
      outBlock.textContent = result.stdout;
      this.terminalOutput.appendChild(outBlock);
    }

    // Standard Error / Compilation block
    if (hasStderr) {
      const errBlock = document.createElement('pre');
      errBlock.className = 'output-stderr';

      // Parse error lines to make line numbers clickable
      const formattedHtml = this.formatErrorLinks(result.stderr);
      errBlock.innerHTML = formattedHtml;
      this.terminalOutput.appendChild(errBlock);

      // Create interactive "Ask Duke AI to Diagnose" action card
      const diagnoseCard = document.createElement('div');
      diagnoseCard.className = 'diagnose-banner';
      diagnoseCard.innerHTML = `
        <div class="diagnose-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="diagnose-text">
          <strong>Need help fixing this error?</strong>
          <span>DukeAI can explain the exact cause and show you how to resolve it.</span>
        </div>
        <button class="diagnose-btn" id="askTutorAboutErrorBtn">
          <span>Ask DukeAI to Explain</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      `;

      diagnoseCard.querySelector('#askTutorAboutErrorBtn').addEventListener('click', () => {
        this.tutor.sendErrorDiagnosisPrompt(result.stderr, code);
      });

      this.terminalOutput.appendChild(diagnoseCard);
    }

    if (!hasStdout && !hasStderr) {
      const emptyBlock = document.createElement('div');
      emptyBlock.className = 'terminal-empty';
      emptyBlock.textContent = '(Program executed successfully with no console output)';
      this.terminalOutput.appendChild(emptyBlock);
    }

    // Wire up line jumps
    this.terminalOutput.querySelectorAll('.error-line-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const line = parseInt(e.currentTarget.dataset.line, 10);
        if (line && this.editor) {
          this.editor.revealLineInCenter(line);
          this.editor.setPosition({ lineNumber: line, column: 1 });
          this.editor.focus();
        }
      });
    });

    // Auto-scroll terminal to bottom
    this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
  }

  formatErrorLinks(rawError) {
    const escaped = rawError
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Match patterns like "Main.java:5:" or "Main.java:12: error:"
    return escaped.replace(/([A-Za-z0-9_$]+\.java):(\d+)(?::)?/g, (match, file, line) => {
      return `<button type="button" class="error-line-link" data-line="${line}" title="Jump to line ${line}">📍 ${file}:${line}</button>`;
    });
  }
}
