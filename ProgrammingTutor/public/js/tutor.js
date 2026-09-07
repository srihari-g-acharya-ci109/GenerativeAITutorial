// AI Java Tutor (DukeAI) Client Controller

export class TutorController {
  constructor(getEditorCodeFn, setEditorCodeFn) {
    this.getEditorCode = getEditorCodeFn;
    this.setEditorCode = setEditorCodeFn;

    this.chatMessagesContainer = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.sendBtn = document.getElementById('sendChatBtn');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    this.chipsContainer = document.getElementById('promptChips');

    this.messages = [];
    this.isGenerating = false;

    this.init();
  }

  init() {
    this.sendBtn.addEventListener('click', () => this.handleSendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    if (this.clearChatBtn) {
      this.clearChatBtn.addEventListener('click', () => this.resetChat());
    }

    // Bind prompt chips
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.dataset.action;
        this.handleChipAction(action);
      });
    });

    // Send initial welcome message if empty
    if (this.messages.length === 0) {
      this.addAssistantMessage(`### 👋 Hello! I'm DukeAI, your Java Tutor!

I'm here to help you master Java from the ground up. Here are some fun ways we can learn together:

- 💡 Click **"Explain Code"** to break down the Java code in your editor line-by-line.
- 🎯 Ask me: *"How do loops work?"* or *"What is public static void main?"*
- 🧩 Click **"Take a Quiz"** to test your knowledge with interactive questions!
- ⚡ If you hit an error while running code, I'll diagnose it instantly.

What would you like to explore today?`);
    }
  }

  getApiKey() {
    return localStorage.getItem('duke_ai_gemini_api_key') || '';
  }

  getModel() {
    return localStorage.getItem('duke_ai_model') || 'gemini-2.5-flash';
  }

  resetChat() {
    this.messages = [];
    this.chatMessagesContainer.innerHTML = '';
    this.addAssistantMessage(`### 🔄 Chat Cleared!
What Java topic or problem would you like to tackle next?`);
  }

  handleChipAction(action) {
    const code = this.getEditorCode();

    switch (action) {
      case 'explain-code':
        this.addUserMessage('Can you please explain the Java code currently in my editor step-by-step for a beginner?');
        this.fetchTutorResponse('Can you explain the code in my editor in detail, line-by-line with simple analogies?', code);
        break;

      case 'find-bugs':
        this.addUserMessage('Could you review my current editor code for any syntax errors, logic bugs, or improvements?');
        this.fetchTutorResponse('Review this Java code. Are there any errors, bugs, or missing semicolons? If so, explain how to fix them.', code);
        break;

      case 'quiz-me':
        this.addUserMessage('Give me a beginner Java quiz question to test my understanding!');
        this.fetchTutorResponse('Generate a friendly multiple-choice quiz question on Java basics for a beginner with options A, B, C, D.', code);
        break;

      case 'simplify':
        this.addUserMessage('Can you explain Java Object-Oriented Programming (OOP) with an easy real-world analogy?');
        this.fetchTutorResponse('Explain Object-Oriented Programming (Classes and Objects) in Java using a relatable real-world metaphor.', code);
        break;

      case 'challenge':
        this.addUserMessage('Give me a fun mini coding challenge to solve in Java!');
        this.fetchTutorResponse('Provide a simple, fun coding challenge for a beginner Java programmer with starter hints.', code);
        break;
    }
  }

  sendErrorDiagnosisPrompt(errorMessage, code) {
    const promptText = `I ran my Java code and encountered this error. Can you please explain what it means and how I can fix it?`;
    this.addUserMessage(promptText);

    const fullPrompt = `Here is the compilation / runtime error I encountered:
\`\`\`
${errorMessage}
\`\`\`
Please explain to me:
1. What does this error actually mean in plain English?
2. Which line number caused it?
3. Exactly what code change do I need to fix it?`;

    this.fetchTutorResponse(fullPrompt, code);

    // If on mobile/small screen, scroll chat into view
    const chatPane = document.getElementById('chatPane');
    if (chatPane && window.innerWidth <= 900) {
      chatPane.scrollIntoView({ behavior: 'smooth' });
    }
  }

  handleSendMessage() {
    const text = this.chatInput.value.trim();
    if (!text || this.isGenerating) return;

    this.chatInput.value = '';
    this.chatInput.style.height = 'auto';
    this.addUserMessage(text);

    const codeContext = this.getEditorCode();
    this.fetchTutorResponse(text, codeContext);
  }

  addUserMessage(text) {
    this.messages.push({ role: 'user', content: text });

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message user-msg';
    msgEl.innerHTML = `
      <div class="msg-avatar">
        <span>You</span>
      </div>
      <div class="msg-bubble">
        <p>${this.escapeHtml(text)}</p>
      </div>
    `;

    this.chatMessagesContainer.appendChild(msgEl);
    this.scrollToBottom();
  }

  addAssistantMessage(markdownText) {
    this.messages.push({ role: 'assistant', content: markdownText });

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message assistant-msg';
    msgEl.innerHTML = `
      <div class="msg-avatar duke-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"></path>
          <circle cx="9" cy="13" r="1"></circle>
          <circle cx="15" cy="13" r="1"></circle>
          <path d="M10 17c.5.5 1.5.5 2 0"></path>
        </svg>
      </div>
      <div class="msg-bubble">
        ${this.renderMarkdown(markdownText)}
      </div>
    `;

    this.chatMessagesContainer.appendChild(msgEl);
    this.bindCodeBlockButtons(msgEl);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const typingEl = document.createElement('div');
    typingEl.id = 'typingIndicator';
    typingEl.className = 'chat-message assistant-msg typing';
    typingEl.innerHTML = `
      <div class="msg-avatar duke-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"></path>
        </svg>
      </div>
      <div class="msg-bubble typing-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    this.chatMessagesContainer.appendChild(typingEl);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  async fetchTutorResponse(userPrompt, codeContext) {
    this.isGenerating = true;
    this.sendBtn.setAttribute('disabled', 'true');
    this.showTypingIndicator();

    const apiKey = this.getApiKey();
    const model = this.getModel();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages,
          apiKey: apiKey || undefined,
          model,
          codeContext: codeContext || undefined
        })
      });

      this.removeTypingIndicator();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to get response`);
      }

      const data = await response.json();
      this.addAssistantMessage(data.reply);
    } catch (err) {
      this.removeTypingIndicator();
      this.addAssistantMessage(`⚠️ **Oops!** I ran into a problem connecting: \`${err.message}\`\n\n*Tip: If you're using a Gemini API key, check that it's valid in ⚙ Settings, or leave it blank to use DukeAI's built-in tutor engine!*`);
    } finally {
      this.isGenerating = false;
      this.sendBtn.removeAttribute('disabled');
      this.chatInput.focus();
    }
  }

  bindCodeBlockButtons(container) {
    container.querySelectorAll('.code-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const codeWrapper = btn.closest('.chat-code-block');
        const code = codeWrapper ? codeWrapper.querySelector('code').innerText : '';

        if (action === 'insert') {
          this.setEditorCode(code);
          btn.innerHTML = `<span>✓ Inserted!</span>`;
          setTimeout(() => {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg><span>Insert to Editor</span>`;
          }, 2000);
        } else if (action === 'copy') {
          navigator.clipboard.writeText(code).then(() => {
            btn.innerHTML = `<span>✓ Copied!</span>`;
            setTimeout(() => {
              btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;
            }, 2000);
          });
        }
      });
    });
  }

  scrollToBottom() {
    this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Lightweight Markdown parser with code blocks, headings, bolding, blockquotes
  renderMarkdown(text) {
    let html = text;

    // Code blocks with syntax and interactive actions
    html = html.replace(/```(java|text)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'java';
      const cleanCode = code.trim();
      return `
        <div class="chat-code-block">
          <div class="code-block-header">
            <span class="code-lang-tag">${language.toUpperCase()}</span>
            <div class="code-actions">
              <button class="code-action-btn" data-action="copy">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </button>
              <button class="code-action-btn insert-btn" data-action="insert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span>Insert to Editor</span>
              </button>
            </div>
          </div>
          <pre><code class="language-${language}">${this.escapeHtml(cleanCode)}</code></pre>
        </div>
      `;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

    // Blockquotes / Tips
    html = html.replace(/^> (.*$)/gim, '<blockquote class="tutor-tip">$1</blockquote>');

    // Bold and Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Paragraphs (split by double newlines)
    const blocks = html.split(/\n\n+/);
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<blockquote')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
  }
}
