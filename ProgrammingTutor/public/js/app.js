// Main Application Orchestrator

import { LESSONS } from './lessons.js';
import { TutorController } from './tutor.js';
import { CompilerController } from './compiler.js';

class JavaStudioApp {
  constructor() {
    this.currentLesson = LESSONS[0];
    this.editor = null;
    this.tutor = null;
    this.compiler = null;

    this.init();
  }

  async init() {
    await this.initMonacoEditor();
    this.initControllers();
    this.initLessonSystem();
    this.initCodeActions();
    this.initSplitResizers();
  }

  // Initialize Monaco Editor with Java configuration
  initMonacoEditor() {
    return new Promise((resolve) => {
      // Configure AMD loader for Monaco
      window.require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
      });

      window.require(['vs/editor/editor.main'], () => {
        // Define Custom Dark Theme
        monaco.editor.defineTheme('gemini-dark-theme', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword', foreground: '38bdf8', fontStyle: 'bold' },
            { token: 'type', foreground: '818cf8', fontStyle: 'bold' },
            { token: 'string', foreground: '34d399' },
            { token: 'number', foreground: 'f59e0b' },
            { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
            { token: 'identifier', foreground: 'e2e8f0' },
            { token: 'delimiter', foreground: '94a3b8' }
          ],
          colors: {
            'editor.background': '#090c13',
            'editor.foreground': '#f1f5f9',
            'editorLineNumber.foreground': '#334155',
            'editorLineNumber.activeForeground': '#38bdf8',
            'editorCursor.foreground': '#00f2fe',
            'editor.selectionBackground': '#1e293b',
            'editor.inactiveSelectionBackground': '#0f172a',
            'editor.lineHighlightBackground': '#0f1422',
            'editorIndentGuide.background': '#1e293b',
            'editorIndentGuide.activeBackground': '#38bdf8'
          }
        });

        // Initialize editor instance
        const container = document.getElementById('monacoEditorContainer');
        container.innerHTML = ''; // clear loading state

        this.editor = monaco.editor.create(container, {
          value: this.currentLesson.starterCode,
          language: 'java',
          theme: 'gemini-dark-theme',
          automaticLayout: true,
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: true,
          lineHeight: 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 14, bottom: 14 },
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          tabSize: 4,
          insertSpaces: true
        });

        resolve();
      });
    });
  }

  initControllers() {
    this.tutor = new TutorController(
      () => this.editor ? this.editor.getValue() : '',
      (newCode) => {
        if (this.editor) {
          this.editor.setValue(newCode);
        }
      }
    );

    this.compiler = new CompilerController(this.editor, this.tutor);
  }

  initLessonSystem() {
    const drawer = document.getElementById('lessonsDrawer');
    const backdrop = document.getElementById('lessonsDrawerBackdrop');
    const openBtn = document.getElementById('openLessonsDrawerBtn');
    const closeBtn = document.getElementById('closeLessonsDrawerBtn');
    const listContainer = document.getElementById('lessonsList');
    const currentLabel = document.getElementById('currentLessonLabel');

    const toggleDrawer = (open) => {
      drawer.classList.toggle('open', open);
      backdrop.classList.toggle('open', open);
    };

    openBtn.addEventListener('click', () => toggleDrawer(true));
    closeBtn.addEventListener('click', () => toggleDrawer(false));
    backdrop.addEventListener('click', () => toggleDrawer(false));

    // Populate Lessons list in drawer
    listContainer.innerHTML = '';
    LESSONS.forEach((lesson, index) => {
      const card = document.createElement('div');
      card.className = `lesson-card ${index === 0 ? 'active' : ''}`;
      card.innerHTML = `
        <div class="lesson-card-header">
          <span class="lesson-card-title">${lesson.title}</span>
          <span class="lesson-diff-badge">${lesson.difficulty}</span>
        </div>
        <p class="lesson-card-desc">${lesson.summary}</p>
      `;

      card.addEventListener('click', () => {
        this.selectLesson(lesson);
        toggleDrawer(false);
        listContainer.querySelectorAll('.lesson-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });

      listContainer.appendChild(card);
    });
  }

  selectLesson(lesson) {
    this.currentLesson = lesson;
    document.getElementById('currentLessonLabel').textContent = lesson.title;

    if (this.editor) {
      this.editor.setValue(lesson.starterCode);
    }

    // Set default stdin if lesson has it (e.g. Scanner)
    const stdinInput = document.getElementById('stdinInput');
    const stdinDrawer = document.getElementById('stdinDrawer');
    const toggleStdinBtn = document.getElementById('toggleStdinBtn');

    if (lesson.defaultStdin) {
      stdinInput.value = lesson.defaultStdin;
      stdinDrawer.classList.add('open');
      if (toggleStdinBtn) toggleStdinBtn.classList.add('active');
    } else {
      stdinInput.value = '';
    }

    // Inform Gemini Tutor about lesson selection
    this.tutor.addAssistantMessage(`### 📖 Switched to: **${lesson.title}**

${lesson.explanation.trim()}

> 🎯 **Mini Challenge**: ${lesson.challenge}

I've loaded the starter code into your editor. Press **Run Code (Ctrl+Enter)** to execute it or ask me if you have any questions!`);
  }

  initCodeActions() {
    // Reset Code
    document.getElementById('resetCodeBtn').addEventListener('click', () => {
      if (this.editor && confirm('Reset editor to initial template? Any unsaved edits will be lost.')) {
        this.editor.setValue(this.currentLesson.starterCode);
      }
    });

    // Format Code
    document.getElementById('formatCodeBtn').addEventListener('click', () => {
      if (this.editor) {
        this.editor.getAction('editor.action.formatDocument')?.run();
      }
    });

    // Export .java file
    document.getElementById('downloadCodeBtn').addEventListener('click', () => {
      if (!this.editor) return;
      const code = this.editor.getValue();
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Main.java';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Resizable split panes logic
  initSplitResizers() {
    const chatPane = document.getElementById('chatPane');
    const rightCol = document.getElementById('rightColumn');
    const hResizer = document.getElementById('horizontalResizer');

    let isDraggingH = false;

    hResizer.addEventListener('mousedown', (e) => {
      isDraggingH = true;
      hResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    const editorPane = document.getElementById('editorPane');
    const terminalPane = document.getElementById('terminalPane');
    const vResizer = document.getElementById('verticalResizer');

    let isDraggingV = false;

    vResizer.addEventListener('mousedown', (e) => {
      isDraggingV = true;
      vResizer.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingH) {
        const newWidth = Math.max(300, Math.min(e.clientX - 10, window.innerWidth - 450));
        chatPane.style.width = `${newWidth}px`;
      }

      if (isDraggingV) {
        const rightColRect = rightCol.getBoundingClientRect();
        const relativeY = e.clientY - rightColRect.top;
        const totalH = rightColRect.height;
        const newEditorH = Math.max(160, Math.min(relativeY, totalH - 120));
        editorPane.style.flex = 'none';
        editorPane.style.height = `${newEditorH}px`;
        terminalPane.style.flex = '1';
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingH) {
        isDraggingH = false;
        hResizer.classList.remove('dragging');
        document.body.style.cursor = '';
      }
      if (isDraggingV) {
        isDraggingV = false;
        vResizer.classList.remove('dragging');
        document.body.style.cursor = '';
      }
    });
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new JavaStudioApp();
});
