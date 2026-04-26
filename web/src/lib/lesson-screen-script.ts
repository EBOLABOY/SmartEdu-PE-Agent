export type LessonScreenScriptSlide = {
  title: string;
  durationSeconds: number;
};

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderLessonScreenScript(slideData: LessonScreenScriptSlide[]) {
  return `<script>
    const slideData = ${escapeScriptJson(slideData)};
    const slides = Array.from(document.querySelectorAll(".slide"));
    const timers = Array.from(document.querySelectorAll(".timer"));
    const startButton = document.getElementById("startButton");
    const prevButton = document.getElementById("prevButton");
    const nextButton = document.getElementById("nextButton");
    const toggleButton = document.getElementById("toggleButton");
    const resetButton = document.getElementById("resetButton");
    const pageIndicator = document.getElementById("pageIndicator");
    const progressBar = document.getElementById("progressBar");
    let current = 0;
    let remaining = 0;
    let paused = true;
    let tickId = null;

    function formatTime(seconds) {
      const safeSeconds = Math.max(0, seconds);
      const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
      const rest = String(safeSeconds % 60).padStart(2, "0");
      return minutes + ":" + rest;
    }

    function durationOf(index) {
      return Number(slides[index]?.dataset.duration || 0);
    }

    function updateTimer() {
      timers.forEach((timer, index) => {
        const slideIndex = index + 1;
        timer.textContent = formatTime(slideIndex === current ? remaining : durationOf(slideIndex));
      });
      const duration = durationOf(current);
      progressBar.style.width = duration > 0 ? ((duration - remaining) / duration * 100) + "%" : "0%";
      pageIndicator.textContent = current === 0 ? "准备开始" : current + " / " + (slides.length - 1);
      toggleButton.textContent = paused ? "继续" : "暂停";
    }

    function showSlide(index, autoplay) {
      current = Math.max(0, Math.min(index, slides.length - 1));
      slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === current));
      remaining = durationOf(current);
      paused = current === 0 ? true : !autoplay;
      updateTimer();
    }

    function nextSlide(autoplay) {
      if (current < slides.length - 1) {
        showSlide(current + 1, autoplay);
      } else {
        paused = true;
        updateTimer();
      }
    }

    function startTick() {
      if (tickId) window.clearInterval(tickId);
      tickId = window.setInterval(() => {
        if (paused || current === 0) return;
        remaining -= 1;
        if (remaining <= 0) {
          remaining = 0;
          updateTimer();
          nextSlide(true);
          return;
        }
        updateTimer();
      }, 1000);
    }

    function setupScoreboards() {
      document.querySelectorAll(".score-team").forEach((team) => {
        const valueNode = team.querySelector("[data-score-value]");
        let score = Number(valueNode?.textContent || 0);

        team.querySelectorAll("[data-score-action]").forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.getAttribute("data-score-action");
            if (action === "plus") score += 1;
            if (action === "minus") score = Math.max(0, score - 1);
            if (action === "reset") score = 0;
            if (valueNode) valueNode.textContent = String(score);
          });
        });
      });
    }

    startButton.addEventListener("click", () => nextSlide(true));
    prevButton.addEventListener("click", () => showSlide(current - 1, false));
    nextButton.addEventListener("click", () => nextSlide(false));
    toggleButton.addEventListener("click", () => {
      if (current === 0) {
        nextSlide(true);
        return;
      }
      paused = !paused;
      updateTimer();
    });
    resetButton.addEventListener("click", () => {
      remaining = durationOf(current);
      paused = current === 0;
      updateTimer();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") nextSlide(false);
      if (event.key === "ArrowLeft") showSlide(current - 1, false);
      if (event.key === " ") {
        event.preventDefault();
        toggleButton.click();
      }
    });

    slideData.forEach((item, index) => {
      if (timers[index]) timers[index].setAttribute("aria-label", item.title + "倒计时");
    });
    setupScoreboards();
    showSlide(0, false);
    startTick();
  </script>`;
}
