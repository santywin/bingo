/**
 * SnapBingo Libre — Seguimiento y Verificador Automático de Cartones + Editor de Patrones
 * 100% Sin Publicidad, Offline-first, Persistencia en localStorage.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'snapbingo_libre_state_v1';
  const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];
  const COL_RANGES = [
    { letter: 'B', min: 1, max: 15 },
    { letter: 'I', min: 16, max: 30 },
    { letter: 'N', min: 31, max: 45 },
    { letter: 'G', min: 46, max: 60 },
    { letter: 'O', min: 61, max: 75 },
  ];

  // =========================================================================
  // 1. DEFINICIÓN DE PATRONES PREDEFINIDOS Y UTILIDADES DE MÁSCARAS 5x5
  // =========================================================================

  /** Convierte una lista de índices (0..24) en un arreglo binario de 25 posiciones */
  function indicesToMask(indices) {
    const mask = new Array(25).fill(0);
    indices.forEach((idx) => {
      if (idx >= 0 && idx < 25) mask[idx] = 1;
    });
    return mask;
  }

  /** Rota una máscara 5x5 90 grados en sentido horario */
  function rotateMask90(mask) {
    const rotated = new Array(25).fill(0);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const oldIdx = r * 5 + c;
        const newR = c;
        const newC = 4 - r;
        const newIdx = newR * 5 + newC;
        rotated[newIdx] = mask[oldIdx];
      }
    }
    return rotated;
  }

  /** Genera las 4 rotaciones únicas de una máscara 5x5 */
  function getUniqueRotations(mask) {
    const seen = new Set();
    const result = [];
    let current = mask.slice();
    for (let i = 0; i < 4; i++) {
      const key = current.join('');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(current.slice());
      }
      current = rotateMask90(current);
    }
    return result;
  }

  const HORIZONTAL_LINE_INDICES = [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
  ];

  const VERTICAL_LINE_INDICES = [
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
  ];

  const DIAGONAL_LINE_INDICES = [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  // las 12 líneas básicas (5 filas, 5 columnas, 2 diagonales)
  const LINE_INDICES = [
    ...HORIZONTAL_LINE_INDICES,
    ...VERTICAL_LINE_INDICES,
    ...DIAGONAL_LINE_INDICES,
  ];

  function buildTwoLinesMasks() {
    const masks = [];
    for (let i = 0; i < LINE_INDICES.length; i++) {
      for (let j = i + 1; j < LINE_INDICES.length; j++) {
        const combined = new Set([...LINE_INDICES[i], ...LINE_INDICES[j]]);
        masks.push(indicesToMask(Array.from(combined)));
      }
    }
    return masks;
  }

  const PRESET_PATTERNS = [
    {
      id: 'line_horizontal',
      name: 'Línea Simple Horizontal',
      description: 'Cualquiera de las 5 filas horizontales',
      isCustom: false,
      previewMask: indicesToMask([10, 11, 12, 13, 14]),
      masks: HORIZONTAL_LINE_INDICES.map(indicesToMask),
    },
    {
      id: 'line_vertical',
      name: 'Línea Simple Vertical',
      description: 'Cualquiera de las 5 columnas verticales (B, I, N, G, O)',
      isCustom: false,
      previewMask: indicesToMask([2, 7, 12, 17, 22]),
      masks: VERTICAL_LINE_INDICES.map(indicesToMask),
    },
    {
      id: 'line_diagonal',
      name: 'Diagonales',
      description: 'Cualquiera de las 2 líneas diagonales principales',
      isCustom: false,
      previewMask: indicesToMask([0, 6, 12, 18, 24]),
      masks: DIAGONAL_LINE_INDICES.map(indicesToMask),
    },
    {
      id: 'single_line',
      name: 'Línea Simple (Todas)',
      description: 'Cualquier línea horizontal, vertical o diagonal (12 opciones)',
      isCustom: false,
      previewMask: indicesToMask([0, 1, 2, 3, 4]),
      masks: LINE_INDICES.map(indicesToMask),
    },
    {
      id: 'two_lines',
      name: 'Dos Líneas',
      description: 'Cualesquiera 2 líneas completas (horizontales, verticales o diagonales)',
      isCustom: false,
      previewMask: indicesToMask([0, 1, 2, 3, 4, 20, 21, 22, 23, 24]),
      masks: buildTwoLinesMasks(),
    },
    {
      id: 'full_house',
      name: 'Cartón Lleno (Apagón)',
      description: 'Las 25 casillas del cartón marcadas (Blackout / Full House)',
      isCustom: false,
      previewMask: new Array(25).fill(1),
      masks: [new Array(25).fill(1)],
    },
    {
      id: 'four_corners',
      name: 'Cuatro Esquinas',
      description: 'Las 4 esquinas del cartón (B1, O1, B5, O5)',
      isCustom: false,
      previewMask: indicesToMask([0, 4, 20, 24]),
      masks: [indicesToMask([0, 4, 20, 24])],
    },
    {
      id: 'outer_frame',
      name: 'Marco Exterior',
      description: 'Todo el borde exterior del cartón (16 casillas)',
      isCustom: false,
      previewMask: indicesToMask([0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]),
      masks: [indicesToMask([0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24])],
    },
    {
      id: 'inner_frame',
      name: 'Marco Interior',
      description: 'Las 8 casillas que rodean el centro libre',
      isCustom: false,
      previewMask: indicesToMask([6, 7, 8, 11, 13, 16, 17, 18]),
      masks: [indicesToMask([6, 7, 8, 11, 13, 16, 17, 18])],
    },
    {
      id: 'letter_x',
      name: 'Letra X',
      description: 'Las dos diagonales principales cruzadas',
      isCustom: false,
      previewMask: indicesToMask([0, 4, 6, 8, 12, 16, 18, 20, 24]),
      masks: [indicesToMask([0, 4, 6, 8, 12, 16, 18, 20, 24])],
    },
    {
      id: 'letter_l',
      name: 'Letra L',
      description: 'Columna B completa y última fila completa',
      isCustom: false,
      previewMask: indicesToMask([0, 5, 10, 15, 20, 21, 22, 23, 24]),
      masks: [indicesToMask([0, 5, 10, 15, 20, 21, 22, 23, 24])],
    },
    {
      id: 'letter_t',
      name: 'Letra T',
      description: 'Primera fila completa y columna central N completa',
      isCustom: false,
      previewMask: indicesToMask([0, 1, 2, 3, 4, 7, 12, 17, 22]),
      masks: [indicesToMask([0, 1, 2, 3, 4, 7, 12, 17, 22])],
    },
    {
      id: 'letter_z',
      name: 'Letra Z',
      description: 'Primera fila, diagonal inversa y última fila',
      isCustom: false,
      previewMask: indicesToMask([0, 1, 2, 3, 4, 8, 12, 16, 20, 21, 22, 23, 24]),
      masks: [indicesToMask([0, 1, 2, 3, 4, 8, 12, 16, 20, 21, 22, 23, 24])],
    },
    {
      id: 'letter_u',
      name: 'Letra U',
      description: 'Columnas B y O más la fila inferior',
      isCustom: false,
      previewMask: indicesToMask([0, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]),
      masks: [indicesToMask([0, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24])],
    },
    {
      id: 'letter_h',
      name: 'Letra H',
      description: 'Columnas B y O más la fila central',
      isCustom: false,
      previewMask: indicesToMask([0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24]),
      masks: [indicesToMask([0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24])],
    },
    {
      id: 'plus_cross',
      name: 'Cruz (+)',
      description: 'Fila central y columna central N',
      isCustom: false,
      previewMask: indicesToMask([2, 7, 10, 11, 12, 13, 14, 17, 22]),
      masks: [indicesToMask([2, 7, 10, 11, 12, 13, 14, 17, 22])],
    },
    {
      id: 'postage_stamp',
      name: 'Sello Postal (2×2)',
      description: 'Bloque 2×2 en cualquiera de las 4 esquinas',
      isCustom: false,
      previewMask: indicesToMask([3, 4, 8, 9]),
      masks: [
        indicesToMask([0, 1, 5, 6]),
        indicesToMask([3, 4, 8, 9]),
        indicesToMask([15, 16, 20, 21]),
        indicesToMask([18, 19, 23, 24]),
      ],
    },
    {
      id: 'diamond',
      name: 'Diamante',
      description: 'Figura de diamante tocando los cuatro bordes medios',
      isCustom: false,
      previewMask: indicesToMask([2, 6, 8, 10, 14, 16, 18, 22]),
      masks: [indicesToMask([2, 6, 8, 10, 14, 16, 18, 22])],
    },
    {
      id: 'pyramid',
      name: 'Pirámide',
      description: 'Triángulo escalonado hacia la base inferior',
      isCustom: false,
      previewMask: indicesToMask([2, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
      masks: [indicesToMask([2, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])],
    },
    {
      id: 'heart',
      name: 'Corazón',
      description: 'Figura clásica de corazón en el cartón',
      isCustom: false,
      previewMask: indicesToMask([1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 22]),
      masks: [indicesToMask([1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 22])],
    },
    {
      id: 'checkerboard',
      name: 'Ajedrez',
      description: 'Casillas alternadas tipo tablero de ajedrez',
      isCustom: false,
      previewMask: indicesToMask([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]),
      masks: [indicesToMask([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24])],
    },
  ];

  // =========================================================================
  // 2. SONIDOS SINTETIZADOS (WEB AUDIO API - SIN ARCHIVOS EXTERNOS)
  // =========================================================================
  let audioCtx = null;

  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;

      if (type === 'dab') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'oneaway') {
        [587.33, 880].forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.09);
          gain.gain.setValueAtTime(0.15, now + idx * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.16);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.09);
          osc.stop(now + idx * 0.09 + 0.16);
        });
      } else if (type === 'bingo') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.11);
          gain.gain.setValueAtTime(0.22, now + idx * 0.11);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.35);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.11);
          osc.stop(now + idx * 0.11 + 0.35);
        });
      }
    } catch (_) {
      // Ignore audio errors
    }
  }

  // =========================================================================
  // 3. GENERACIÓN Y EVALUACIÓN DE CARTONES 75-BOLAS
  // =========================================================================

  function getLetterForNumber(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    if (num <= 75) return 'O';
    return '#';
  }

  function formatBallLabel(num) {
    const letter = getLetterForNumber(num);
    return letter === '#' ? `#${num}` : `${letter}-${num}`;
  }

  /** Genera una matriz de 25 números (índices 0..24 por filas, centro 12 = 0/FREE) */
  function generateRandomCardNumbers() {
    const cols = COL_RANGES.map(({ min, max }) => {
      const pool = [];
      for (let n = min; n <= max; n++) pool.push(n);
      // Shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, 5);
    });

    const cells = new Array(25);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const idx = r * 5 + c;
        cells[idx] = idx === 12 ? 0 : cols[c][r];
      }
    }
    return cells;
  }

  const CARD_COLORS = ['blue', 'emerald', 'purple', 'amber', 'rose', 'cyan'];

  function createSampleCards(count = 4, startIndex = 1) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const num = startIndex + i;
      list.push({
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + i,
        name: `Cartón #${num}`,
        color: CARD_COLORS[(num - 1) % CARD_COLORS.length],
        numbers: generateRandomCardNumbers(),
        createdAt: Date.now() + i,
      });
    }
    return list;
  }

  // =========================================================================
  // 4. ESTADO DE LA APLICACIÓN Y PERSISTENCIA
  // =========================================================================

  let state = {
    cards: [],
    calledNumbers: [], // Arreglo en orden cronológico de marcado
    activePatternIds: ['single_line'], // Permite 1 o varios patrones activos
    customPatterns: [],
    soundEnabled: true,
    patternsMinimized: false,
    boardMinimized: false,
    show99Balls: false,
    filterMode: 'all', // 'all' | 'bingo' | 'oneaway' | 'twoaway'
    sortBy: 'closest', // 'closest' | 'id' | 'name'
    editorCells: indicesToMask([0, 4, 6, 8, 12, 16, 18, 20, 24]), // Estado del editor 5x5
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.cards)) state.cards = parsed.cards;
        if (Array.isArray(parsed.calledNumbers)) state.calledNumbers = parsed.calledNumbers;
        if (Array.isArray(parsed.activePatternIds) && parsed.activePatternIds.length > 0) {
          state.activePatternIds = parsed.activePatternIds;
        }
        if (Array.isArray(parsed.customPatterns)) state.customPatterns = parsed.customPatterns;
        if (typeof parsed.soundEnabled === 'boolean') state.soundEnabled = parsed.soundEnabled;
        if (typeof parsed.patternsMinimized === 'boolean') state.patternsMinimized = parsed.patternsMinimized;
        if (typeof parsed.boardMinimized === 'boolean') state.boardMinimized = parsed.boardMinimized;
        if (typeof parsed.show99Balls === 'boolean') state.show99Balls = parsed.show99Balls;
        if (parsed.sortBy) state.sortBy = parsed.sortBy;
      }
    } catch (_) {
      // ignore corrupted storage
    }

    if (state.cards.length === 0) {
      state.cards = createSampleCards(4, 1);
      saveState();
    }
  }

  let cloudSaveTimer = null;

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cards: state.cards,
          calledNumbers: state.calledNumbers,
          activePatternIds: state.activePatternIds,
          customPatterns: state.customPatterns,
          soundEnabled: state.soundEnabled,
          patternsMinimized: state.patternsMinimized,
          boardMinimized: state.boardMinimized,
          show99Balls: state.show99Balls,
          sortBy: state.sortBy,
        })
      );
    } catch (_) {
      // ignore storage quota errors
    }

    if (window.SantyFirebase && window.SantyFirebase.saveUserBingoStateToFirestore) {
      if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => {
        window.SantyFirebase.saveUserBingoStateToFirestore(state);
      }, 600);
    }
  }

  function getAllPatterns() {
    return [...PRESET_PATTERNS, ...state.customPatterns];
  }

  function getActivePatterns() {
    const all = getAllPatterns();
    const active = all.filter((p) => state.activePatternIds.includes(p.id));
    return active.length > 0 ? active : [PRESET_PATTERNS[0]];
  }

  // =========================================================================
  // 5. MOTOR DE VERIFICACIÓN AUTOMÁTICA DE CARTONES (POINT 2 & POINT 4)
  // =========================================================================

  /**
   * Evalúa un cartón contra todos los patrones activos.
   * Retorna:
   * - isBingo: boolean
   * - minMissing: número mínimo de bolas faltantes para lograr cualquier variante activa
   * - winningCells: Set de índices (0..24) que forman un Bingo completo
   * - winningPatternNames: lista de nombres de patrones completados
   * - oneAwayCells: Set de índices (0..24) que están a 1 sola bola de completar una variante
   * - oneAwayNumbers: arreglo de números específicos que hacen ganar a este cartón de inmediato
   * - bestMissingNumbers: números que faltan en la mejor línea/variante actual
   * - targetPatternCells: Set de índices que forman parte del patrón activo (para guía visual)
   */
  function evaluateCard(card, calledSet, activePatterns) {
    let isBingo = false;
    let minMissing = Infinity;
    const winningCells = new Set();
    const winningPatternNames = new Set();
    const oneAwayCells = new Set();
    const oneAwayNumbersSet = new Set();
    let bestMissingNumbers = [];
    const targetPatternCells = new Set();

    // Mostramos puntos guía en las casillas objetivo de cualquier patrón activo de 1 sola figura fija
    activePatterns.forEach((p) => {
      if (p.masks.length === 1) {
        p.masks[0].forEach((bit, idx) => {
          if (bit === 1) targetPatternCells.add(idx);
        });
      }
    });

    let bestPatternName = activePatterns[0]?.name || '';

    for (const pattern of activePatterns) {
      for (const mask of pattern.masks) {
        const missingIndices = [];
        const maskIndices = [];

        for (let idx = 0; idx < 25; idx++) {
          if (mask[idx] === 1) {
            maskIndices.push(idx);
            const num = card.numbers[idx];
            const isMarked = idx === 12 || num === 0 || calledSet.has(num);
            if (!isMarked) {
              missingIndices.push(idx);
            }
          }
        }

        const missingCount = missingIndices.length;

        if (missingCount === 0 && maskIndices.length > 0) {
          isBingo = true;
          winningPatternNames.add(pattern.name);
          maskIndices.forEach((i) => winningCells.add(i));
        }

        if (missingCount === 1) {
          const missIdx = missingIndices[0];
          oneAwayCells.add(missIdx);
          const missNum = card.numbers[missIdx];
          if (missNum > 0) oneAwayNumbersSet.add(missNum);
        }

        if (missingCount < minMissing) {
          minMissing = missingCount;
          bestPatternName = pattern.name;
          bestMissingNumbers = missingIndices
            .map((i) => card.numbers[i])
            .filter((n) => n > 0);
        }
      }
    }

    if (minMissing === Infinity) minMissing = 25;

    return {
      card,
      isBingo,
      minMissing,
      bestPatternName,
      winningCells,
      winningPatternNames: Array.from(winningPatternNames),
      oneAwayCells,
      oneAwayNumbers: Array.from(oneAwayNumbersSet),
      bestMissingNumbers,
      targetPatternCells,
    };
  }

  // =========================================================================
  // 6. ACCIONES DEL JUEGO (MARCAR BOLAS, SORTEAR, REINICIAR)
  // =========================================================================

  let previousBingoCardIds = new Set();
  let previousOneAwayCardIds = new Set();

  function syncPreviousWinnerSets() {
    const calledSet = new Set(state.calledNumbers);
    const activePatterns = getActivePatterns();
    previousBingoCardIds = new Set();
    previousOneAwayCardIds = new Set();

    state.cards.forEach((card) => {
      const ev = evaluateCard(card, calledSet, activePatterns);
      if (ev.isBingo) previousBingoCardIds.add(card.id);
      else if (ev.minMissing === 1) previousOneAwayCardIds.add(card.id);
    });
  }

  function toggleBall(num) {
    const n = parseInt(num, 10);
    if (isNaN(n) || n < 1 || n > 999) return;

    if (n > 75) {
      state.show99Balls = true;
    }

    const existingIdx = state.calledNumbers.indexOf(n);
    if (existingIdx !== -1) {
      state.calledNumbers.splice(existingIdx, 1);
      playSound('dab');
    } else {
      state.calledNumbers.push(n);
    }

    saveState();
    renderAll(existingIdx === -1 ? n : null);
  }

  function undoLastBall() {
    if (state.calledNumbers.length === 0) return;
    state.calledNumbers.pop();
    playSound('dab');
    saveState();
    renderAll(null);
  }

  function resetRound() {
    if (state.calledNumbers.length === 0) return;
    state.calledNumbers = [];
    state.filterMode = 'all';
    previousBingoCardIds.clear();
    previousOneAwayCardIds.clear();
    hideBingoToast();
    playSound('dab');
    saveState();
    renderAll(null);
  }

  // =========================================================================
  // 7. RENDERIZADO DE LA INTERFAZ
  // =========================================================================

  function renderAll(newlyAddedBall = null) {
    const calledSet = new Set(state.calledNumbers);
    const activePatterns = getActivePatterns();

    // Evaluar todos los cartones
    const evaluations = state.cards.map((card) =>
      evaluateCard(card, calledSet, activePatterns)
    );

    const bingoEvals = evaluations.filter((e) => e.isBingo);
    const oneAwayEvals = evaluations.filter((e) => !e.isBingo && e.minMissing === 1);
    const twoAwayEvals = evaluations.filter((e) => !e.isBingo && e.minMissing === 2);

    // Detectar nuevos ganadores o nuevos cartones a 1 bola cuando se marca una bola nueva
    if (newlyAddedBall !== null) {
      const newWinners = bingoEvals.filter((e) => !previousBingoCardIds.has(e.card.id));
      const newOneAway = oneAwayEvals.filter((e) => !previousOneAwayCardIds.has(e.card.id));

      if (newWinners.length > 0) {
        playSound('bingo');
        const names = newWinners.map((w) => w.card.name).join(', ');
        const patNames = newWinners[0].winningPatternNames.join(' / ');
        showBingoToast(
          `¡BINGO! (${newWinners.length} ${newWinners.length === 1 ? 'cartón' : 'cartones'})`,
          `${names} completó el patrón "${patNames}" con la bola ${formatBallLabel(newlyAddedBall)}.`
        );
      } else if (newOneAway.length > 0) {
        playSound('oneaway');
      } else {
        playSound('dab');
      }
    }

    // Actualizar sets de estado previo
    previousBingoCardIds = new Set(bingoEvals.map((e) => e.card.id));
    previousOneAwayCardIds = new Set(oneAwayEvals.map((e) => e.card.id));

    // Recolectar todas las bolas que darían Bingo inmediato (One-Away numbers globales)
    const globalNeededMap = new Map(); // number -> count of cards waiting on it
    oneAwayEvals.forEach((ev) => {
      ev.oneAwayNumbers.forEach((num) => {
        globalNeededMap.set(num, (globalNeededMap.get(num) || 0) + 1);
      });
    });

    renderHeaderAndAlerts(activePatterns, bingoEvals, oneAwayEvals, globalNeededMap);
    renderMasterBoard(calledSet, globalNeededMap);
    renderCardsToolbarCounts(evaluations.length, bingoEvals.length, oneAwayEvals.length, twoAwayEvals.length);
    renderCardsGrid(evaluations, calledSet);
  }

  function renderHeaderAndAlerts(activePatterns, bingoEvals, oneAwayEvals, globalNeededMap) {
    // Botón de sonido
    document.getElementById('soundIcon').textContent = state.soundEnabled ? '🔊' : '🔇';

    // Etiqueta del patrón activo
    const patternLabel =
      activePatterns.length === 1
        ? activePatterns[0].name
        : `${activePatterns.length} Patrones Activos`;
    document.getElementById('activePatternLabel').textContent = patternLabel;

    // Contadores de alerta rápida
    const statBingoBox = document.getElementById('statBingoBox');
    const statOneAwayBox = document.getElementById('statOneAwayBox');
    document.getElementById('statBingoCount').textContent = bingoEvals.length;
    document.getElementById('statOneAwayCount').textContent = oneAwayEvals.length;

    statBingoBox.classList.toggle('has-bingo', bingoEvals.length > 0);
    statOneAwayBox.classList.toggle('has-oneaway', oneAwayEvals.length > 0);

    // Lista de bolas críticas ("Bolas para ganar ahora")
    const waitingBallsList = document.getElementById('waitingBallsList');
    waitingBallsList.innerHTML = '';

    if (globalNeededMap.size === 0) {
      const span = document.createElement('span');
      span.className = 'muted-hint';
      span.textContent =
        state.calledNumbers.length === 0
          ? 'Marca números en el tablero para ver qué bolas te hacen ganar.'
          : 'Ningún cartón está a 1 bola todavía.';
      waitingBallsList.appendChild(span);
    } else {
      const sortedNeeded = Array.from(globalNeededMap.entries()).sort((a, b) => a[0] - b[0]);
      sortedNeeded.forEach(([num, cardCount]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'waiting-ball-chip';
        chip.title = `Haz clic para marcar ${formatBallLabel(num)} (${cardCount} cartón/es la esperan)`;
        chip.innerHTML = `${formatBallLabel(num)}${cardCount > 1 ? ` <small>(×${cardCount})</small>` : ''}`;
        chip.addEventListener('click', () => toggleBall(num));
        waitingBallsList.appendChild(chip);
      });
    }
  }

  function renderMasterBoard(calledSet, globalNeededMap) {
    document.getElementById('calledCount').textContent = state.calledNumbers.length;
    document.getElementById('btnUndoLast').disabled = state.calledNumbers.length === 0;

    const callerPanel = document.getElementById('callerPanel');
    const mainLayout = document.getElementById('mainLayout');
    const btnToggleBoard = document.getElementById('btnToggleBoardNumbers');

    if (callerPanel) {
      callerPanel.classList.toggle('minimized', !!state.boardMinimized);
    }
    if (mainLayout) {
      mainLayout.classList.toggle('board-minimized', !!state.boardMinimized);
    }
    if (btnToggleBoard) {
      btnToggleBoard.textContent = state.boardMinimized
        ? '▼ Mostrar Números'
        : '▲ Minimizar Números';
    }

    const hasNumbersOver75 =
      state.calledNumbers.some((n) => n > 75) ||
      state.cards.some((c) => c.numbers.some((n) => n > 75));
    const showExtended = state.show99Balls || hasNumbersOver75;

    const btnToggle99 = document.getElementById('btnToggle99Balls');
    if (btnToggle99) {
      btnToggle99.textContent = showExtended ? '▲ Ocultar 76–99' : '+ 76–99';
    }

    // Historial de últimas bolas
    const recentContainer = document.getElementById('recentBallsList');
    recentContainer.innerHTML = '';
    if (state.calledNumbers.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty-history';
      empty.textContent = 'Ninguna bola marcada aún';
      recentContainer.appendChild(empty);
    } else {
      const lastBalls = state.calledNumbers.slice(-8).reverse();
      lastBalls.forEach((num, idx) => {
        const pill = document.createElement('span');
        pill.className = 'recent-ball-pill' + (idx === 0 ? ' latest' : '');
        pill.textContent = formatBallLabel(num);
        recentContainer.appendChild(pill);
      });
    }

    // Tablero por filas B I N G O (+ filas extendidas 76-99 si están activas)
    const masterBoard = document.getElementById('masterBoard');
    masterBoard.innerHTML = '';

    const rowsToRender = [...COL_RANGES];
    if (showExtended) {
      rowsToRender.push(
        { letter: '+1', cssClass: 'EXT', min: 76, max: 90 },
        { letter: '+2', cssClass: 'EXT', min: 91, max: 99 }
      );
    }

    rowsToRender.forEach(({ letter, cssClass, min, max }) => {
      const row = document.createElement('div');
      row.className = 'master-row';

      const letterEl = document.createElement('div');
      letterEl.className = `master-letter letter-${cssClass || letter}`;
      letterEl.textContent = letter;
      row.appendChild(letterEl);

      for (let n = min; n <= max; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'master-ball';
        if (calledSet.has(n)) {
          btn.classList.add('called');
        } else if (globalNeededMap.has(n)) {
          btn.classList.add('needed-for-bingo');
          btn.title = `¡Bola ganadora! Te da BINGO al instante`;
        }
        btn.textContent = n;
        btn.addEventListener('click', () => toggleBall(n));
        row.appendChild(btn);
      }

      masterBoard.appendChild(row);
    });
  }

  function renderCardsToolbarCounts(allCount, bingoCount, oneAwayCount, twoAwayCount) {
    document.getElementById('countFilterAll').textContent = allCount;
    document.getElementById('countFilterBingo').textContent = bingoCount;
    document.getElementById('countFilterOneAway').textContent = oneAwayCount;
    document.getElementById('countFilterTwoAway').textContent = twoAwayCount;

    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.filter === state.filterMode);
    });

    document.getElementById('sortCardsSelect').value = state.sortBy;
  }

  function renderCardsGrid(evaluations, calledSet) {
    const grid = document.getElementById('cardsGrid');
    grid.innerHTML = '';

    // Filtrar
    let filtered = evaluations.filter((ev) => {
      if (state.filterMode === 'bingo') return ev.isBingo;
      if (state.filterMode === 'oneaway') return !ev.isBingo && ev.minMissing === 1;
      if (state.filterMode === 'twoaway') return !ev.isBingo && ev.minMissing === 2;
      return true;
    });

    // Ordenar
    filtered.sort((a, b) => {
      if (state.sortBy === 'closest') {
        if (a.isBingo !== b.isBingo) return a.isBingo ? -1 : 1;
        if (a.minMissing !== b.minMissing) return a.minMissing - b.minMissing;
        return a.card.createdAt - b.card.createdAt;
      }
      if (state.sortBy === 'name') {
        return a.card.name.localeCompare(b.card.name, 'es', { numeric: true });
      }
      return a.card.createdAt - b.card.createdAt;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-cards-state';
      empty.innerHTML = `
        <h3>No hay cartones en esta vista</h3>
        <p>Puedes cambiar el filtro arriba o agregar nuevos cartones físicos o aleatorios.</p>
      `;
      grid.appendChild(empty);
      return;
    }

    filtered.forEach((ev) => {
      const { card, isBingo, minMissing, bestPatternName, winningCells, winningPatternNames, oneAwayCells, oneAwayNumbers, bestMissingNumbers, targetPatternCells } = ev;

      const cardEl = document.createElement('article');
      cardEl.className = `bingo-card card-theme-${card.color || 'blue'}`;
      if (isBingo) cardEl.classList.add('status-bingo');
      else if (minMissing === 1) cardEl.classList.add('status-oneaway');

      // Badge de estado
      let badgeClass = 'badge-normal';
      let badgeText = `Faltan ${minMissing}`;
      if (isBingo) {
        badgeClass = 'badge-winner';
        badgeText = '🏆 ¡BINGO!';
      } else if (minMissing === 1) {
        badgeClass = 'badge-1away';
        badgeText = '🔥 ¡A 1 BOLA!';
      } else if (minMissing === 2) {
        badgeClass = 'badge-2away';
        badgeText = '⚡ A 2 bolas';
      }

      const subtitleText = isBingo
        ? `Ganador: ${winningPatternNames.join(', ')}`
        : state.activePatternIds.length > 1
          ? `Más cerca de: ${bestPatternName}`
          : `Patrón: ${bestPatternName}`;

      // Construir cabecera y letras
      const headerBar = document.createElement('div');
      headerBar.className = 'card-header-bar';
      headerBar.innerHTML = `
        <div class="card-title-group">
          <span class="card-title"></span>
          <span class="card-subtitle-status"></span>
        </div>
        <span class="card-status-badge ${badgeClass}">${badgeText}</span>
      `;
      headerBar.querySelector('.card-title').textContent = card.name;
      headerBar.querySelector('.card-subtitle-status').textContent = subtitleText;
      cardEl.appendChild(headerBar);

      const lettersRow = document.createElement('div');
      lettersRow.className = 'card-bingo-letters';
      lettersRow.innerHTML = '<span>B</span><span>I</span><span>N</span><span>G</span><span>O</span>';
      cardEl.appendChild(lettersRow);

      // Cuadrícula 5x5 del cartón
      const grid5x5 = document.createElement('div');
      grid5x5.className = 'card-grid-5x5';

      for (let idx = 0; idx < 25; idx++) {
        const num = card.numbers[idx];
        const isFree = idx === 12 || num === 0;
        const isMarked = isFree || calledSet.has(num);

        const cell = document.createElement('div');
        cell.className = 'card-cell';

        if (isFree) {
          cell.classList.add('free-space', 'marked');
          cell.textContent = 'LIBRE';
        } else {
          cell.textContent = num;
          if (isMarked) cell.classList.add('marked');
          cell.title = `Toca para ${isMarked ? 'desmarcar' : 'marcar'} ${formatBallLabel(num)} en todos los cartones`;
          cell.addEventListener('click', () => toggleBall(num));
        }

        if (targetPatternCells.has(idx)) {
          cell.classList.add('in-target-pattern');
        }
        if (winningCells.has(idx)) {
          cell.classList.add('winning-cell');
        } else if (!isBingo && oneAwayCells.has(idx)) {
          cell.classList.add('missing-oneaway');
        }

        grid5x5.appendChild(cell);
      }
      cardEl.appendChild(grid5x5);

      // Pie del cartón con bolas esperadas y botones Editar / Duplicar / Eliminar
      const footer = document.createElement('div');
      footer.className = 'card-footer';

      const waitingSpan = document.createElement('div');
      waitingSpan.className = 'card-waiting-text';
      if (isBingo) {
        waitingSpan.innerHTML = `<strong>¡Cartón verificado ganador!</strong>`;
      } else if (minMissing === 1 && oneAwayNumbers.length > 0) {
        const formatted = oneAwayNumbers.map(formatBallLabel).join(', ');
        waitingSpan.innerHTML = `Esperando: <strong>${formatted}</strong>`;
      } else if (bestMissingNumbers.length > 0) {
        const previewMissing = bestMissingNumbers.slice(0, 3).map(formatBallLabel).join(', ');
        waitingSpan.innerHTML = `Cerca: ${previewMissing}${bestMissingNumbers.length > 3 ? '…' : ''}`;
      } else {
        waitingSpan.textContent = 'Listo para jugar';
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn-card-action';
      btnEdit.title = 'Editar números del cartón';
      btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', () => openCardEditorModal(card));

      const btnDup = document.createElement('button');
      btnDup.type = 'button';
      btnDup.className = 'btn-card-action';
      btnDup.title = 'Duplicar este cartón';
      btnDup.textContent = '📋';
      btnDup.addEventListener('click', () => duplicateCard(card));

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn-card-action';
      btnDel.title = 'Eliminar cartón';
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', () => deleteCard(card.id));

      actionsDiv.appendChild(btnEdit);
      actionsDiv.appendChild(btnDup);
      actionsDiv.appendChild(btnDel);

      footer.appendChild(waitingSpan);
      footer.appendChild(actionsDiv);
      cardEl.appendChild(footer);

      grid.appendChild(cardEl);
    });
  }

  // =========================================================================
  // 8. MODAL DE PATRONES Y CREADOR PERSONALIZADO (POINT 4)
  // =========================================================================

  function togglePatternSelection(patternId, patternObj = null) {
    const isSelected = state.activePatternIds.includes(patternId);
    if (isSelected) {
      if (state.activePatternIds.length === 1) {
        alert('Debe haber al menos 1 patrón activo para verificar el Bingo.');
        return;
      }
      state.activePatternIds = state.activePatternIds.filter((id) => id !== patternId);
    } else {
      state.activePatternIds.push(patternId);
      if (patternObj) {
        state.editorCells = (patternObj.previewMask || patternObj.masks[0]).slice();
        renderCustomPatternEditorGrid();
      }
    }
    saveState();
    syncPreviousWinnerSets();
    renderPatternModalList();
    renderAll(null);
  }

  function selectSinglePattern(patternId, patternObj = null) {
    state.activePatternIds = [patternId];
    if (patternObj) {
      state.editorCells = (patternObj.previewMask || patternObj.masks[0]).slice();
      renderCustomPatternEditorGrid();
    }
    saveState();
    syncPreviousWinnerSets();
    renderPatternModalList();
    renderAll(null);
  }

  function renderPatternModalList() {
    const container = document.getElementById('presetPatternsList');
    const chipsBar = document.getElementById('selectedPatternsChipsBar');
    const countSpan = document.getElementById('modalSelectedPatternsCount');
    const query = (document.getElementById('patternSearchInput').value || '').trim().toLowerCase();

    container.innerHTML = '';
    const activePatterns = getActivePatterns();
    if (countSpan) countSpan.textContent = activePatterns.length;

    // Renderizar chips de patrones activos arriba del buscador
    if (chipsBar) {
      chipsBar.innerHTML = '';
      activePatterns.forEach((pat) => {
        const chip = document.createElement('span');
        chip.className = 'selected-pattern-chip';
        const label = document.createElement('span');
        label.textContent = `✓ ${pat.name}`;
        chip.appendChild(label);

        if (activePatterns.length > 1) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.title = `Desmarcar ${pat.name}`;
          removeBtn.innerHTML = '&times;';
          removeBtn.addEventListener('click', () => togglePatternSelection(pat.id));
          chip.appendChild(removeBtn);
        }
        chipsBar.appendChild(chip);
      });
    }

    const allPatterns = getAllPatterns().filter((p) => {
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    });

    allPatterns.forEach((pattern) => {
      const isSelected = state.activePatternIds.includes(pattern.id);
      const card = document.createElement('div');
      card.className = 'pattern-option-card' + (isSelected ? ' selected' : '');
      card.title = isSelected
        ? 'Haz clic para desmarcar este patrón'
        : 'Haz clic para marcar y agregar este patrón a la partida';

      // Casilla visual de verificación (checkbox)
      const checkBadge = document.createElement('span');
      checkBadge.className = 'pattern-check-badge';
      checkBadge.textContent = '✓';
      card.appendChild(checkBadge);

      // Mini preview 5x5
      const miniGrid = document.createElement('div');
      miniGrid.className = 'mini-pattern-grid';
      const mask = pattern.previewMask || pattern.masks[0];
      for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        if (mask[i] === 1) cell.classList.add('active');
        else if (i === 12) cell.classList.add('free');
        miniGrid.appendChild(cell);
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'pattern-option-name';
      nameEl.textContent = pattern.name;

      const subEl = document.createElement('div');
      subEl.className = 'pattern-option-sub';
      subEl.textContent =
        pattern.masks.length === 1
          ? pattern.isCustom
            ? 'Personalizado'
            : '1 figura'
          : `${pattern.masks.length} variantes`;

      const onlyThisBtn = document.createElement('button');
      onlyThisBtn.type = 'button';
      onlyThisBtn.className = 'btn-only-this-pattern';
      onlyThisBtn.textContent = 'Solo este';
      onlyThisBtn.title = 'Dejar únicamente este patrón activo y desmarcar los demás';
      onlyThisBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSinglePattern(pattern.id, pattern);
      });

      card.appendChild(miniGrid);
      card.appendChild(nameEl);
      card.appendChild(subEl);
      card.appendChild(onlyThisBtn);

      if (pattern.isCustom) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-delete-custom-pattern';
        delBtn.title = 'Eliminar patrón personalizado';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCustomPattern(pattern.id);
        });
        card.appendChild(delBtn);
      }

      // Clic simple marca o desmarca el patrón directamente (multiselección directa)
      card.addEventListener('click', () => {
        togglePatternSelection(pattern.id, pattern);
      });

      container.appendChild(card);
    });
  }

  function renderCustomPatternEditorGrid() {
    const grid = document.getElementById('customPatternEditorGrid');
    grid.innerHTML = '';

    for (let idx = 0; idx < 25; idx++) {
      const cell = document.createElement('div');
      cell.className = 'editor-cell' + (state.editorCells[idx] === 1 ? ' active' : '');
      const r = Math.floor(idx / 5) + 1;
      const c = idx % 5;
      cell.textContent = idx === 12 ? 'LIBRE' : `${BINGO_LETTERS[c]}${r}`;
      cell.addEventListener('click', () => {
        state.editorCells[idx] = state.editorCells[idx] === 1 ? 0 : 1;
        renderCustomPatternEditorGrid();
      });
      grid.appendChild(cell);
    }
  }

  function saveCustomPattern() {
    const nameInput = document.getElementById('customPatternName');
    const name = nameInput.value.trim() || `Mi Patrón #${state.customPatterns.length + 1}`;
    const includeRotations = document.getElementById('customPatternIncludeRotations').checked;

    const activeBits = state.editorCells.filter((b) => b === 1).length;
    if (activeBits === 0) {
      alert('Selecciona al menos una casilla en la cuadrícula 5×5 para crear tu patrón.');
      return;
    }

    const baseMask = state.editorCells.slice();
    const masks = includeRotations ? getUniqueRotations(baseMask) : [baseMask];

    const newPattern = {
      id: 'custom_' + Date.now(),
      name,
      description: includeRotations
        ? `Patrón personalizado (${masks.length} rotaciones válidas)`
        : `Patrón personalizado (${activeBits} casillas)`,
      isCustom: true,
      previewMask: baseMask,
      masks,
    };

    state.customPatterns.push(newPattern);
    if (!state.activePatternIds.includes(newPattern.id)) {
      state.activePatternIds.push(newPattern.id);
    }
    nameInput.value = '';
    saveState();
    syncPreviousWinnerSets();
    renderPatternModalList();
    renderAll(null);
  }

  function deleteCustomPattern(patternId) {
    state.customPatterns = state.customPatterns.filter((p) => p.id !== patternId);
    state.activePatternIds = state.activePatternIds.filter((id) => id !== patternId);
    if (state.activePatternIds.length === 0) {
      state.activePatternIds = ['single_line'];
    }
    saveState();
    syncPreviousWinnerSets();
    renderPatternModalList();
    renderAll(null);
  }

  // =========================================================================
  // 9. MODAL DE CREACIÓN Y EDICIÓN DE CARTONES (POINT 2)
  // =========================================================================

  function checkCardInputWarnings() {
    const inputs = document.querySelectorAll('#cardNumbersInputGrid .card-num-input');
    const warnBox = document.getElementById('cardValidationError');
    const warnings = [];
    const counts = new Map();

    // Primera pasada: contar ocurrencias para detectar repetidos
    inputs.forEach((inp, idx) => {
      if (idx === 12) return;
      const val = parseInt(inp.value, 10);
      if (!isNaN(val) && val > 0) {
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    });

    const repeatedSet = new Set();
    const outOfRangeList = [];
    const over75List = [];
    let emptyCount = 0;

    inputs.forEach((inp, idx) => {
      if (idx === 12) return;
      inp.classList.remove('has-warning');

      const raw = inp.value.trim();
      if (raw === '') {
        emptyCount++;
        inp.classList.add('has-warning');
        return;
      }

      const val = parseInt(raw, 10);
      const col = idx % 5;
      const { letter, min, max } = COL_RANGES[col];

      if (isNaN(val) || val < 1) {
        emptyCount++;
        inp.classList.add('has-warning');
        return;
      }

      if (counts.get(val) > 1) {
        repeatedSet.add(val);
        inp.classList.add('has-warning');
      }

      if (val > 75) {
        over75List.push(`${val} (${letter})`);
        inp.classList.add('has-warning');
      } else if (val < min || val > max) {
        outOfRangeList.push(`${val} en ${letter} (usual: ${min}–${max})`);
        inp.classList.add('has-warning');
      }
    });

    if (repeatedSet.size > 0) {
      warnings.push(`Número(s) repetido(s): <strong>${Array.from(repeatedSet).join(', ')}</strong>.`);
    }
    if (over75List.length > 0) {
      warnings.push(`Número(s) mayores a 75: <strong>${over75List.join(', ')}</strong> (se activarán las bolas hasta el 99).`);
    }
    if (outOfRangeList.length > 0) {
      warnings.push(`Fuera del rango habitual de su columna: ${outOfRangeList.slice(0, 4).join(', ')}${outOfRangeList.length > 4 ? '…' : ''}.`);
    }
    if (emptyCount > 0) {
      warnings.push(`Hay <strong>${emptyCount}</strong> casilla(s) vacía(s) o en 0 (se tomarán como casillas libres).`);
    }

    if (warnings.length > 0) {
      warnBox.innerHTML =
        `<div><strong>⚠️ Sugerencia / Advertencia (no bloquea el guardado):</strong></div>` +
        warnings.map((w) => `<div>• ${w}</div>`).join('') +
        `<div style="margin-top:4px; opacity:0.85;">💡 Si tu cartón físico viene impreso así, puedes guardarlo sin problema.</div>`;
      warnBox.classList.remove('hidden');
    } else {
      warnBox.classList.add('hidden');
    }
  }

  function buildCardEditorInputs(numbers = null) {
    const grid = document.getElementById('cardNumbersInputGrid');
    grid.innerHTML = '';
    const errBox = document.getElementById('cardValidationError');
    errBox.classList.add('hidden');

    for (let idx = 0; idx < 25; idx++) {
      const c = idx % 5;
      const { letter } = COL_RANGES[c];
      const input = document.createElement('input');
      input.type = idx === 12 ? 'text' : 'number';
      input.className = 'card-num-input';
      input.dataset.idx = idx;

      if (idx === 12) {
        input.value = 'LIBRE';
        input.disabled = true;
        input.classList.add('free-cell-input');
      } else {
        input.placeholder = `${letter}`;
        if (numbers && numbers[idx] > 0) {
          input.value = numbers[idx];
        }
        input.addEventListener('input', checkCardInputWarnings);
      }

      grid.appendChild(input);
    }

    checkCardInputWarnings();
  }

  function openCardEditorModal(cardToEdit = null) {
    const modal = document.getElementById('cardModal');
    const idInput = document.getElementById('editingCardId');
    const nameInput = document.getElementById('cardNameInput');
    const colorInput = document.getElementById('cardColorInput');

    if (cardToEdit) {
      document.getElementById('cardModalTitle').textContent = `✏️ Editar ${cardToEdit.name}`;
      idInput.value = cardToEdit.id;
      nameInput.value = cardToEdit.name;
      colorInput.value = cardToEdit.color || 'blue';
      buildCardEditorInputs(cardToEdit.numbers);
    } else {
      const nextNum = state.cards.length + 1;
      document.getElementById('cardModalTitle').textContent = '➕ Agregar Nuevo Cartón';
      idInput.value = '';
      nameInput.value = `Cartón #${nextNum}`;
      colorInput.value = CARD_COLORS[(nextNum - 1) % CARD_COLORS.length];
      buildCardEditorInputs(generateRandomCardNumbers());
    }

    modal.classList.remove('hidden');
  }

  function handleSaveCardForm(e) {
    e.preventDefault();

    const editingId = document.getElementById('editingCardId').value;
    const name = document.getElementById('cardNameInput').value.trim() || `Cartón #${state.cards.length + 1}`;
    const color = document.getElementById('cardColorInput').value;

    const inputs = document.querySelectorAll('#cardNumbersInputGrid .card-num-input');
    const numbers = new Array(25).fill(0);

    for (let idx = 0; idx < 25; idx++) {
      if (idx === 12) {
        numbers[12] = 0;
        continue;
      }
      const val = parseInt(inputs[idx].value, 10);
      numbers[idx] = !isNaN(val) && val > 0 ? val : 0;
      if (numbers[idx] > 75) {
        state.show99Balls = true;
      }
    }

    if (editingId) {
      const target = state.cards.find((c) => c.id === editingId);
      if (target) {
        target.name = name;
        target.color = color;
        target.numbers = numbers;
      }
    } else {
      state.cards.push({
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name,
        color,
        numbers,
        createdAt: Date.now(),
      });
    }

    saveState();
    syncPreviousWinnerSets();
    document.getElementById('cardModal').classList.add('hidden');
    renderAll(null);
  }

  function duplicateCard(card) {
    state.cards.push({
      id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: `${card.name} (Copia)`,
      color: card.color,
      numbers: card.numbers.slice(),
      createdAt: Date.now(),
    });
    saveState();
    syncPreviousWinnerSets();
    renderAll(null);
  }

  function deleteCard(cardId) {
    if (!confirm('¿Eliminar este cartón?')) return;
    state.cards = state.cards.filter((c) => c.id !== cardId);
    saveState();
    syncPreviousWinnerSets();
    renderAll(null);
  }

  // =========================================================================
  // 10. TOAST DE CELEBRACIÓN Y RESPALDO JSON
  // =========================================================================

  function showBingoToast(title, desc) {
    const toast = document.getElementById('bingoToast');
    document.getElementById('bingoToastTitle').textContent = title;
    document.getElementById('bingoToastDesc').textContent = desc;
    toast.classList.remove('hidden');
  }

  function hideBingoToast() {
    document.getElementById('bingoToast').classList.add('hidden');
  }

  function openBackupModal() {
    const modal = document.getElementById('backupModal');
    const textarea = document.getElementById('backupJsonTextarea');
    textarea.value = JSON.stringify(
      {
        cards: state.cards,
        customPatterns: state.customPatterns,
        activePatternIds: state.activePatternIds,
        calledNumbers: state.calledNumbers,
      },
      null,
      2
    );
    modal.classList.remove('hidden');
  }

  // =========================================================================
  // 11. EVENTOS E INICIALIZACIÓN
  // =========================================================================

  function bindEvents() {
    // Sonido
    document.getElementById('btnSoundToggle').addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      saveState();
      renderAll(null);
    });

    // Abrir modal de patrones
    const openPatterns = () => {
      renderPatternModalList();
      renderCustomPatternEditorGrid();
      document.getElementById('patternModal').classList.remove('hidden');
    };
    document.getElementById('btnOpenPatternModal').addEventListener('click', openPatterns);

    // Buscador de patrones
    document.getElementById('patternSearchInput').addEventListener('input', renderPatternModalList);

    // Botones rápidos de selección múltiple de patrones
    document.getElementById('btnSelectOnlyFirstPattern').addEventListener('click', () => {
      const firstId = state.activePatternIds[0] || 'single_line';
      state.activePatternIds = [firstId];
      saveState();
      syncPreviousWinnerSets();
      renderPatternModalList();
      renderAll(null);
    });
    document.getElementById('btnSelectAllPatterns').addEventListener('click', () => {
      state.activePatternIds = getAllPatterns().map((p) => p.id);
      saveState();
      syncPreviousWinnerSets();
      renderPatternModalList();
      renderAll(null);
    });

    // Herramientas del editor 5x5 de patrones personalizados
    document.getElementById('btnEditorClear').addEventListener('click', () => {
      state.editorCells = new Array(25).fill(0);
      renderCustomPatternEditorGrid();
    });
    document.getElementById('btnEditorFill').addEventListener('click', () => {
      state.editorCells = new Array(25).fill(1);
      renderCustomPatternEditorGrid();
    });
    document.getElementById('btnEditorInvert').addEventListener('click', () => {
      state.editorCells = state.editorCells.map((v) => (v === 1 ? 0 : 1));
      renderCustomPatternEditorGrid();
    });
    document.getElementById('btnEditorRotate').addEventListener('click', () => {
      state.editorCells = rotateMask90(state.editorCells);
      renderCustomPatternEditorGrid();
    });
    document.getElementById('btnSaveCustomPattern').addEventListener('click', saveCustomPattern);

    // Abrir modal de nuevo cartón
    document.getElementById('btnOpenCardModal').addEventListener('click', () => {
      openCardEditorModal(null);
    });

    // Botones internos del modal de cartón
    document.getElementById('btnFillRandomCard').addEventListener('click', () => {
      buildCardEditorInputs(generateRandomCardNumbers());
    });
    document.getElementById('btnClearCardInputs').addEventListener('click', () => {
      buildCardEditorInputs(new Array(25).fill(0));
    });
    document.getElementById('cardEditorForm').addEventListener('submit', handleSaveCardForm);

    // Nueva ronda
    document.getElementById('btnResetRound').addEventListener('click', resetRound);

    // Mostrar / ocultar bolas del 76 al 99 en el tablero
    document.getElementById('btnToggle99Balls').addEventListener('click', () => {
      state.show99Balls = !state.show99Balls;
      saveState();
      renderAll(null);
    });

    // Minimizar / mostrar la cuadrícula de números del tablero
    document.getElementById('btnToggleBoardNumbers').addEventListener('click', () => {
      state.boardMinimized = !state.boardMinimized;
      saveState();
      renderAll(null);
    });

    // Marcado rápido por teclado (input 1-999 + Enter)
    document.getElementById('quickDabForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('quickNumberInput');
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 999) {
        toggleBall(val);
        input.value = '';
        input.focus();
      }
    });

    // Deshacer última bola marcada
    document.getElementById('btnUndoLast').addEventListener('click', undoLastBall);

    // Filtros de cartones
    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.filterMode = tab.dataset.filter;
        renderAll(null);
      });
    });

    // Clic en las cajas superiores de estadística filtra directamente
    document.getElementById('statBingoBox').addEventListener('click', () => {
      state.filterMode = state.filterMode === 'bingo' ? 'all' : 'bingo';
      renderAll(null);
    });
    document.getElementById('statOneAwayBox').addEventListener('click', () => {
      state.filterMode = state.filterMode === 'oneaway' ? 'all' : 'oneaway';
      renderAll(null);
    });

    // Ordenamiento de cartones
    document.getElementById('sortCardsSelect').addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      saveState();
      renderAll(null);
    });

    // Modal de respaldo: Descargar archivo JSON e Importar archivo agregando cartones
    document.getElementById('btnExportImport').addEventListener('click', openBackupModal);

    document.getElementById('btnDownloadBackup').addEventListener('click', () => {
      const jsonContent = JSON.stringify(
        {
          cards: state.cards,
          customPatterns: state.customPatterns,
          activePatternIds: state.activePatternIds,
          calledNumbers: state.calledNumbers,
        },
        null,
        2
      );
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `bingo-win-respaldo-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    const fileInput = document.getElementById('backupFileInput');
    document.getElementById('btnImportBackup').addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          let addedCardsCount = 0;

          if (Array.isArray(data.cards)) {
            data.cards.forEach((c, idx) => {
              if (c && Array.isArray(c.numbers) && c.numbers.length === 25) {
                state.cards.push({
                  id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + idx,
                  name: c.name || `Cartón #${state.cards.length + 1}`,
                  color: c.color || CARD_COLORS[state.cards.length % CARD_COLORS.length],
                  numbers: c.numbers.slice(0, 25),
                  createdAt: Date.now() + idx,
                });
                if (c.numbers.some((n) => n > 75)) {
                  state.show99Balls = true;
                }
                addedCardsCount++;
              }
            });
          }

          if (Array.isArray(data.customPatterns)) {
            const existingNames = new Set(state.customPatterns.map((p) => p.name));
            data.customPatterns.forEach((p, idx) => {
              if (p && Array.isArray(p.masks)) {
                const newId = 'custom_' + Date.now() + '_' + idx;
                state.customPatterns.push({
                  ...p,
                  id: newId,
                  name: existingNames.has(p.name) ? `${p.name} (Importado)` : p.name,
                  isCustom: true,
                });
              }
            });
          }

          saveState();
          syncPreviousWinnerSets();
          document.getElementById('backupModal').classList.add('hidden');
          renderAll(null);
          alert(`Se agregaron ${addedCardsCount} cartón(es) a tu lista actual.`);
        } catch (_) {
          alert('El archivo seleccionado no es un archivo JSON de respaldo válido.');
        }
      };
      reader.readAsText(file);
    });
    document.getElementById('btnDeleteAllCards').addEventListener('click', () => {
      if (!confirm('¿Borrar TODOS los cartones actuales?')) return;
      state.cards = [];
      saveState();
      syncPreviousWinnerSets();
      document.getElementById('backupModal').classList.add('hidden');
      renderAll(null);
    });

    // Toast de Bingo
    document.getElementById('btnDismissToast').addEventListener('click', hideBingoToast);
    document.getElementById('btnViewWinningCards').addEventListener('click', () => {
      state.filterMode = 'bingo';
      hideBingoToast();
      renderAll(null);
    });

    // Cerrar modales
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-close-modal');
        document.getElementById(targetId).classList.add('hidden');
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.add('hidden');
        }
      });
    });
  }

  // Inicializar aplicación directamente sin pantalla de bloqueo
  loadState();
  syncPreviousWinnerSets();
  bindEvents();
  renderAll(null);
})();

