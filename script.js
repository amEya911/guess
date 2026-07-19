document.addEventListener("DOMContentLoaded", () => {
  // 1. Secret Word Configuration & Normalization
  let secretWord = "APPLE"; // Fallback default
  if (typeof SECRET_WORD !== "undefined" && SECRET_WORD) {
    secretWord = SECRET_WORD;
  }
  
  // Normalize secret word: uppercase, A-Z only
  secretWord = secretWord.trim().toUpperCase().replace(/[^A-Z]/g, "");
  
  const wordLength = secretWord.length;
  if (wordLength !== 5 && wordLength !== 6) {
    console.warn(`Wordle Clone warning: Secret word "${secretWord}" is ${wordLength} letters long. The game is optimized for 5 or 6 letters.`);
  }
  
  // Rules: 5 letters -> 6 guesses; 6 letters -> 7 guesses; otherwise fallback
  const maxGuesses = wordLength === 5 ? 6 : (wordLength === 6 ? 7 : wordLength + 1);

  // 2. Game State Variables
  let currentGuess = "";
  let currentRow = 0;
  let gameOver = false;
  let gameResult = null; // 'win', 'lose', or null
  let isAnimating = false;
  let validWords = new Set();
  let dictionaryLoaded = false;

  // 3. Stats Data Management
  const STATS_KEY = "wordle-clone-stats";
  let stats = loadStats();

  // 4. DOM Elements
  const board = document.getElementById("board");
  const keyboard = document.getElementById("keyboard");
  const toastContainer = document.getElementById("toast-container");
  const announcer = document.getElementById("aria-announcer");

  const helpDialog = document.getElementById("help-dialog");
  const statsDialog = document.getElementById("stats-dialog");

  const helpBtn = document.getElementById("help-btn");
  const statsBtn = document.getElementById("stats-btn");

  const closeHelpBtn = document.getElementById("close-help-btn");
  const closeStatsBtn = document.getElementById("close-stats-btn");

  const resetGameBtn = document.getElementById("reset-game-btn");

  // 5. Virtual Keyboard Key Layout Configuration
  const KEYBOARD_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "backspace"]
  ];

  // 6. Core Initialization
  initGame();

  function initGame() {
    createGrid();
    buildKeyboard();
    setupEventListeners();
    loadDictionary();

    // Show rules dialog on first visit
    const visitedBefore = localStorage.getItem("wordle-clone-visited");
    if (!visitedBefore) {
      setTimeout(() => {
        helpDialog.showModal();
        localStorage.setItem("wordle-clone-visited", "true");
      }, 500);
    }
  }

  // 7. Dynamic Board Grid Generation
  function createGrid() {
    board.innerHTML = "";
    
    // Set board containers variables in css if custom is required
    document.documentElement.style.setProperty('--grid-cols', wordLength);
    document.documentElement.style.setProperty('--grid-rows', maxGuesses);

    for (let r = 0; r < maxGuesses; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      rowEl.setAttribute("role", "row");
      rowEl.id = `row-${r}`;
      
      for (let c = 0; c < wordLength; c++) {
        const tileEl = document.createElement("div");
        tileEl.className = "tile";
        tileEl.setAttribute("role", "gridcell");
        tileEl.setAttribute("aria-label", `Row ${r + 1}, Column ${c + 1}: Empty`);
        tileEl.id = `tile-${r}-${c}`;
        rowEl.appendChild(tileEl);
      }
      board.appendChild(rowEl);
    }
  }

  // 8. Virtual Keyboard Generation
  function buildKeyboard() {
    keyboard.innerHTML = "";
    
    KEYBOARD_ROWS.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.className = "keyboard-row";
      
      row.forEach(key => {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.dataset.key = key;
        
        if (key === "enter") {
          btn.textContent = "ENTER";
          btn.classList.add("wide");
          btn.setAttribute("aria-label", "Enter submitted guess");
        } else if (key === "backspace") {
          btn.textContent = "⌫";
          btn.classList.add("wide");
          btn.setAttribute("aria-label", "Backspace deletes last letter");
        } else {
          btn.textContent = key.toUpperCase();
          btn.setAttribute("aria-label", `Key ${key.toUpperCase()}`);
        }
        
        rowEl.appendChild(btn);
      });
      
      keyboard.appendChild(rowEl);
    });
  }

  // 9. Input Router Handler
  function handleInput(key) {
    if (gameOver || isAnimating) return;

    if (key === "enter") {
      submitGuess();
    } else if (key === "backspace") {
      removeLetter();
    } else {
      addLetter(key);
    }
  }

  function addLetter(char) {
    if (currentGuess.length < wordLength) {
      currentGuess += char.toUpperCase();
      
      const colIndex = currentGuess.length - 1;
      const tile = document.getElementById(`tile-${currentRow}-${colIndex}`);
      if (tile) {
        tile.textContent = char.toUpperCase();
        tile.dataset.state = "active";
        tile.setAttribute("aria-label", `Row ${currentRow + 1}, Column ${colIndex + 1}: ${char.toUpperCase()}`);
      }
    }
  }

  function removeLetter() {
    if (currentGuess.length > 0) {
      const colIndex = currentGuess.length - 1;
      const tile = document.getElementById(`tile-${currentRow}-${colIndex}`);
      if (tile) {
        tile.textContent = "";
        tile.removeAttribute("data-state");
        tile.setAttribute("aria-label", `Row ${currentRow + 1}, Column ${colIndex + 1}: Empty`);
      }
      currentGuess = currentGuess.slice(0, -1);
    }
  }

  // 10. Wordle Logic & Color Evaluation (Handles Duplicate Letters)
  function submitGuess() {
    if (currentGuess.length !== wordLength) {
      showToast("Not enough letters");
      
      // Trigger shake animation on current row container
      const activeRowEl = document.getElementById(`row-${currentRow}`);
      if (activeRowEl) {
        activeRowEl.classList.add("shake");
        activeRowEl.addEventListener("animationend", () => {
          activeRowEl.classList.remove("shake");
        }, { once: true });
      }
      return;
    }

    if (!dictionaryLoaded) {
      showToast("Loading dictionary...");
      return;
    }

    // Validate guess against dictionary (fallback to allow if offline or loading failed)
    if (validWords.size > 1 && !validWords.has(currentGuess)) {
      showToast("No such word found");
      
      // Trigger shake animation on current row container
      const activeRowEl = document.getElementById(`row-${currentRow}`);
      if (activeRowEl) {
        activeRowEl.classList.add("shake");
        activeRowEl.addEventListener("animationend", () => {
          activeRowEl.classList.remove("shake");
        }, { once: true });
      }
      return;
    }

    isAnimating = true;
    
    // Evaluate match statuses
    const guessLetters = currentGuess.split("");
    const targetLetters = secretWord.split("");
    const resultStates = Array(wordLength).fill("absent");
    const targetLetterCounts = {};

    // Step A: Count letters in target word
    for (const char of targetLetters) {
      targetLetterCounts[char] = (targetLetterCounts[char] || 0) + 1;
    }

    // Step B: Mark correct greens
    for (let i = 0; i < wordLength; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        resultStates[i] = "correct";
        targetLetterCounts[guessLetters[i]]--;
      }
    }

    // Step C: Mark yellow presents for remaining counts
    for (let i = 0; i < wordLength; i++) {
      if (resultStates[i] !== "correct") {
        const char = guessLetters[i];
        if (targetLetterCounts[char] && targetLetterCounts[char] > 0) {
          resultStates[i] = "present";
          targetLetterCounts[char]--;
        }
      }
    }

    // Staggered Flip Tile Animations
    for (let i = 0; i < wordLength; i++) {
      const tile = document.getElementById(`tile-${currentRow}-${i}`);
      if (tile) {
        tile.style.animationDelay = `${i * 250}ms`;
        tile.classList.add("flip");
        
        // Swap background color at the vertical vertical collapse point (half of flip animation duration)
        setTimeout(() => {
          tile.dataset.state = resultStates[i];
          tile.setAttribute("aria-label", `Row ${currentRow + 1}, Column ${i + 1}: ${guessLetters[i]}, ${resultStates[i]}`);
        }, i * 250 + 300);
      }
    }

    // Run completion triggers after last tile completes animation
    const totalFlipTime = (wordLength - 1) * 250 + 600;
    setTimeout(() => {
      updateKeyboardColors(guessLetters, resultStates);

      if (currentGuess === secretWord) {
        handleWin();
      } else if (currentRow === maxGuesses - 1) {
        handleLoss();
      } else {
        // Go to next row
        currentRow++;
        currentGuess = "";
        isAnimating = false;
      }
    }, totalFlipTime);
  }

  // 11. Key Color Updates
  function updateKeyboardColors(guessLetters, resultStates) {
    for (let i = 0; i < wordLength; i++) {
      const char = guessLetters[i].toLowerCase();
      const state = resultStates[i];
      const keyBtn = document.querySelector(`.key[data-key="${char}"]`);
      if (!keyBtn) continue;

      const currentClass = keyBtn.dataset.state || "";

      if (state === "correct") {
        keyBtn.classList.remove("present", "absent");
        keyBtn.classList.add("correct");
        keyBtn.dataset.state = "correct";
      } else if (state === "present") {
        if (currentClass !== "correct") {
          keyBtn.classList.remove("absent");
          keyBtn.classList.add("present");
          keyBtn.dataset.state = "present";
        }
      } else if (state === "absent") {
        if (currentClass !== "correct" && currentClass !== "present") {
          keyBtn.classList.add("absent");
          keyBtn.dataset.state = "absent";
        }
      }
    }
  }

  // 12. Game Over States (Win & Loss)
  function handleWin() {
    gameOver = true;
    gameResult = "win";
    isAnimating = false;

    // Trigger bounce celebration
    for (let i = 0; i < wordLength; i++) {
      const tile = document.getElementById(`tile-${currentRow}-${i}`);
      if (tile) {
        tile.style.animationDelay = `${i * 100}ms`;
        tile.classList.add("bounce");
      }
    }

    // Choose congrats toast message based on row index
    const congrats = ["Genius", "Magnificent", "Splendid", "Great", "Nice", "Awesome", "Phew"];
    const msg = congrats[Math.min(currentRow, congrats.length - 1)];
    showToast(msg, 2500);

    saveStats(true, currentRow);
    updateGameOverUI(true);

    // Show game over modal after delay
    setTimeout(() => {
      statsDialog.showModal();
    }, 1500);
  }

  function handleLoss() {
    gameOver = true;
    gameResult = "lose";
    isAnimating = false;

    showToast(`Answer was: ${secretWord}`, 3000);

    saveStats(false, currentRow);
    updateGameOverUI(false);

    // Show game over modal after delay
    setTimeout(() => {
      statsDialog.showModal();
    }, 1500);
  }

  // 13. Reset / Restart Logic
  function resetGame() {
    currentGuess = "";
    currentRow = 0;
    gameOver = false;
    gameResult = null;
    isAnimating = false;

    createGrid();
    buildKeyboard();
    
    statsDialog.close();
    showToast("Game Reset. Good luck!", 1500);
    announce("New game started. Enter your guess.");
  }

  // 14. Toast Alerts System
  function showToast(message, duration = 2000) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toast.setAttribute("role", "alert");
    toastContainer.appendChild(toast);
    
    announce(message);

    setTimeout(() => {
      toast.classList.add("fade-out");
      toast.addEventListener("animationend", () => {
        toast.remove();
      });
    }, duration);
  }

  function announce(message) {
    if (announcer) {
      announcer.textContent = message;
    }
  }

  // 15. Statistics Data Operations
  function loadStats() {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          parsed.played = parsed.played || 0;
          parsed.won = parsed.won || 0;
          parsed.currentStreak = parsed.currentStreak || 0;
          parsed.maxStreak = parsed.maxStreak || 0;
          
          if (!parsed.guesses) parsed.guesses = {};
          for (let i = 1; i <= 7; i++) {
            if (parsed.guesses[i] === undefined) {
              parsed.guesses[i] = 0;
            }
          }
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse statistics from storage", e);
      }
    }

    const defaultStats = {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      guesses: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(defaultStats));
    return defaultStats;
  }

  function saveStats(isWin, winRowIndex) {
    stats.played++;
    if (isWin) {
      stats.won++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
      }
      const tries = winRowIndex + 1;
      stats.guesses[tries] = (stats.guesses[tries] || 0) + 1;
    } else {
      stats.currentStreak = 0;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  async function loadDictionary() {
    try {
      const response = await fetch("https://cdn.jsdelivr.net/npm/an-array-of-english-words/index.json");
      const words = await response.json();
      
      words.forEach(word => {
        if (word.length === 5 || word.length === 6) {
          validWords.add(word.toUpperCase());
        }
      });
      
      // Always ensure the configured secret word is valid to avoid getting stuck
      validWords.add(secretWord);
      dictionaryLoaded = true;
      console.log(`Loaded dictionary. Found ${validWords.size} words of lengths 5 or 6.`);
    } catch (e) {
      console.error("Failed to load dictionary from CDN", e);
      // Fallback: load only the secret word and allow other guesses if offline to prevent game-breaking locks
      validWords.add(secretWord);
      dictionaryLoaded = true;
    }
  }

  function updateGameOverUI(isWin) {
    const titleEl = document.getElementById("game-over-title");
    if (titleEl) {
      titleEl.textContent = isWin ? "Victory!" : "Game Over";
    }
    
    const wordEl = document.getElementById("word-display");
    if (wordEl) {
      wordEl.textContent = secretWord;
    }
  }

  // 16. Event Bindings
  function setupEventListeners() {
    // Physical Keyboard Listener
    document.addEventListener("keydown", (e) => {
      if (helpDialog.open || statsDialog.open) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "enter") {
        handleInput("enter");
      } else if (key === "backspace") {
        handleInput("backspace");
      } else if (/^[a-z]$/.test(key)) {
        handleInput(key);
      }
    });

    // Virtual Keyboard Click delegation
    keyboard.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn || !keyboard.contains(btn)) return;
      
      const key = btn.dataset.key;
      if (key) {
        handleInput(key);
        btn.blur(); // Remove active focus ring on virtual tap
      }
    });

    // Modals Control Buttons
    helpBtn.addEventListener("click", () => helpDialog.showModal());
    statsBtn.addEventListener("click", () => {
      if (gameOver) {
        updateGameOverUI(gameResult === "win");
        statsDialog.showModal();
      } else {
        showToast("Solve the puzzle to reveal the content!");
      }
    });

    closeHelpBtn.addEventListener("click", () => helpDialog.close());
    closeStatsBtn.addEventListener("click", () => statsDialog.close());

    // Close on backdrop clicks
    helpDialog.addEventListener("click", (e) => {
      if (e.target === helpDialog) helpDialog.close();
    });
    statsDialog.addEventListener("click", (e) => {
      if (e.target === statsDialog) statsDialog.close();
    });

    // Action control Buttons
    resetGameBtn.addEventListener("click", () => {
      resetGame();
    });
  }
});
