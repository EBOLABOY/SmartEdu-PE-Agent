/**
 * @module html-screen-editor
 * HTML 大屏文档辅助函数。负责补齐完整 HTML 外壳，并注入课堂投屏
 * 所需的基础翻页与计时引擎。
 */

const SCREEN_ENGINE_SCRIPT = `
<script data-screen-engine>
(function() {
  if (window.__screenEngineInitialized) return;
  window.__screenEngineInitialized = true;

  document.addEventListener("DOMContentLoaded", () => {
    const slides = Array.from(document.querySelectorAll('.slide'));
    if (slides.length === 0) return;

    let currentIndex = 0;
    let timerInterval = null;
    let timeRemaining = 0;

    // 初始化样式：只显示第一页，其他隐藏
    slides.forEach((slide, index) => {
      slide.style.display = index === 0 ? 'block' : 'none';
      slide.style.position = 'absolute';
      slide.style.top = '0';
      slide.style.left = '0';
      slide.style.width = '100%';
      slide.style.height = '100%';
    });

    function formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateTimerDisplay(slide, seconds) {
      const displays = slide.querySelectorAll('.duration-display, .timer-display');
      displays.forEach(el => {
        el.textContent = formatTime(seconds);
      });
    }

    function goToSlide(index) {
      if (index < 0 || index >= slides.length) return;
      
      slides[currentIndex].style.display = 'none';
      currentIndex = index;
      const currentSlide = slides[currentIndex];
      currentSlide.style.display = 'block';

      if (timerInterval) clearInterval(timerInterval);

      const durationRaw = currentSlide.getAttribute('data-duration');
      if (durationRaw) {
        timeRemaining = parseInt(durationRaw, 10);
        if (isNaN(timeRemaining)) timeRemaining = 0;
      } else {
        timeRemaining = 0;
      }

      updateTimerDisplay(currentSlide, timeRemaining);

      if (timeRemaining > 0) {
        timerInterval = setInterval(() => {
          timeRemaining--;
          updateTimerDisplay(currentSlide, timeRemaining);
          if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            if (currentIndex < slides.length - 1) {
               goToSlide(currentIndex + 1);
            }
          }
        }, 1000);
      }
    }

    function goNext() {
      goToSlide(Math.min(currentIndex + 1, slides.length - 1));
    }

    function goPrevious() {
      goToSlide(Math.max(currentIndex - 1, 0));
    }

    function ensureFallbackControls() {
      if (slides.length <= 1 || document.querySelector('[data-screen-engine-controls]')) return;

      const controls = document.createElement('div');
      controls.setAttribute('data-screen-engine-controls', 'true');
      controls.style.position = 'fixed';
      controls.style.right = '24px';
      controls.style.bottom = '24px';
      controls.style.zIndex = '2147483647';
      controls.style.display = 'flex';
      controls.style.gap = '10px';
      controls.style.fontFamily = 'system-ui, sans-serif';

      const previous = document.createElement('button');
      previous.type = 'button';
      previous.textContent = '上一页';
      previous.setAttribute('aria-label', '上一页');
      previous.setAttribute('data-screen-prev', 'true');

      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '下一页';
      next.setAttribute('aria-label', '下一页');
      next.setAttribute('data-screen-next', 'true');

      [previous, next].forEach((button) => {
        button.style.border = '1px solid rgba(255,255,255,0.55)';
        button.style.borderRadius = '999px';
        button.style.background = 'rgba(15,23,42,0.78)';
        button.style.color = 'rgb(248,250,252)';
        button.style.fontSize = '16px';
        button.style.fontWeight = '700';
        button.style.padding = '10px 16px';
        button.style.cursor = 'pointer';
      });

      controls.append(previous, next);
      document.body.appendChild(controls);

      previous.addEventListener('click', goPrevious);
      next.addEventListener('click', goNext);
    }

    // 绑定开始按钮
    const startButtons = document.querySelectorAll('.start-button');
    startButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (currentIndex === 0) {
          if (slides.length > 1) {
            goToSlide(1);
          } else {
            btn.style.transition = 'opacity 0.3s';
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
            goToSlide(0);
          }
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goNext();
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goPrevious();
      }
    });
    ensureFallbackControls();
    document.querySelectorAll('[data-screen-next]').forEach(btn => {
      btn.addEventListener('click', goNext);
    });
    document.querySelectorAll('[data-screen-prev]').forEach(btn => {
      btn.addEventListener('click', goPrevious);
    });
    goToSlide(0);
  });
})();
</script>
`.trim();

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenceMatch = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenceMatch?.[1]?.trim() ?? trimmed;
}

export function ensureCompleteHtmlDocument(value: string) {
  const html = stripCodeFence(value);
  let finalHtml = html;

  if (/<html\b/i.test(html) && /<body\b/i.test(html)) {
    finalHtml = html.startsWith("<!DOCTYPE html>") ? html : `<!DOCTYPE html>\n${html}`;
  } else {
    finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>互动大屏</title>
</head>
<body>
${html}
</body>
</html>`;
  }

  if (!finalHtml.includes("data-screen-engine")) {
    finalHtml = finalHtml.replace(/<\/body>/i, `\n${SCREEN_ENGINE_SCRIPT}\n</body>`);
  }

  return finalHtml;
}
