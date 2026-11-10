// script.js - 3D Rubik's Cube Controller, Constraint Tracker, and Solver Connector

// 1. Definition of Colors
const COLORS = [
  { id: 'W', name: 'White',  hex: '#FFFFFF', textDark: true,  defaultFace: 'U' },
  { id: 'Y', name: 'Yellow', hex: '#FFD500', textDark: true,  defaultFace: 'D' },
  { id: 'R', name: 'Red',    hex: '#C41E3A', textDark: false, defaultFace: 'R' },
  { id: 'O', name: 'Orange', hex: '#FF5800', textDark: false, defaultFace: 'L' },
  { id: 'B', name: 'Blue',   hex: '#0051BA', textDark: false, defaultFace: 'B' },
  { id: 'G', name: 'Green',  hex: '#009E60', textDark: false, defaultFace: 'F' },
];

const COLOR_MAP_BY_ID = Object.fromEntries(COLORS.map(c => [c.id, c]));

// Cube faces order matching the solver's internal representation: U, F, D, R, L, B
const FACES = ['U', 'F', 'D', 'R', 'L', 'B'];

// State of all 54 stickers: face -> array of 9 color IDs ('W', 'Y', 'R', 'O', 'B', 'G', or null)
let cubeState = {
  U: new Array(9).fill('W'),
  F: new Array(9).fill('G'),
  D: new Array(9).fill('Y'),
  R: new Array(9).fill('R'),
  L: new Array(9).fill('O'),
  B: new Array(9).fill('B'),
};

// UI & Interaction State
let selectedBrushColor = null;
let currentRotation = { x: -28, y: 35 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let autoSpinInterval = null;
let hasShownConstraintModalForCounts = false;

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  setupPalette();
  setup3DCube();
  setup2DNet();
  setupOrbitControls();
  setupCameraPresets();
  setupActionButtons();
  setupModal();
  updateAllVisuals();
});

/* -------------------------------------------------------------
   PALETTE SETUP
------------------------------------------------------------- */
function setupPalette() {
  const container = document.getElementById('palette-grid');
  container.innerHTML = '';

  COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = color.hex;
    swatch.title = `${color.name} Brush`;
    swatch.dataset.colorId = color.id;

    const label = document.createElement('span');
    label.className = 'swatch-letter';
    label.style.color = color.textDark ? '#1e293b' : '#ffffff';
    label.textContent = color.name.slice(0, 3);
    swatch.appendChild(label);

    swatch.addEventListener('click', () => {
      if (selectedBrushColor === color.id) {
        selectedBrushColor = null;
        swatch.classList.remove('active');
      } else {
        selectedBrushColor = color.id;
        document.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      }
    });

    container.appendChild(swatch);
  });
}

/* -------------------------------------------------------------
   3D CUBE SETUP
------------------------------------------------------------- */
function setup3DCube() {
  const cubeElem = document.getElementById('cube-3d');
  cubeElem.innerHTML = '';

  FACES.forEach(faceKey => {
    const faceDiv = document.createElement('div');
    faceDiv.className = `cube-face face-${faceKey}`;
    faceDiv.dataset.face = faceKey;

    for (let i = 0; i < 9; i++) {
      const sticker = document.createElement('div');
      sticker.className = `sticker sticker-${faceKey}-${i}`;
      if (i === 4) sticker.classList.add('center-sticker');
      sticker.dataset.face = faceKey;
      sticker.dataset.index = i;

      sticker.addEventListener('click', (e) => {
        e.stopPropagation();
        handleStickerClick(faceKey, i);
      });

      faceDiv.appendChild(sticker);
    }

    const tag = document.createElement('span');
    tag.className = 'face-name-tag';
    tag.textContent = faceKey;
    faceDiv.appendChild(tag);

    cubeElem.appendChild(faceDiv);
  });
}

/* -------------------------------------------------------------
   2D NET SETUP (Unfolded view with correct 12x9 grid layout)
------------------------------------------------------------- */
function setup2DNet() {
  const netGrid = document.getElementById('net-grid');
  netGrid.innerHTML = '';

  // 12 columns x 9 rows grid
  // Rows 0-2: cols 3-5 are U
  // Rows 3-5: cols 0-2 is L, cols 3-5 is F, cols 6-8 is R, cols 9-11 is B
  // Rows 6-8: cols 3-5 are D
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 12; c++) {
      const cell = document.createElement('div');
      cell.className = 'net-cell';

      let faceKey = null;
      let idx = null;

      if (r >= 0 && r <= 2 && c >= 3 && c <= 5) {
        faceKey = 'U';
        idx = r * 3 + (c - 3);
      } else if (r >= 3 && r <= 5) {
        const rowInFace = r - 3;
        if (c >= 0 && c <= 2) {
          faceKey = 'L';
          idx = rowInFace * 3 + c;
        } else if (c >= 3 && c <= 5) {
          faceKey = 'F';
          idx = rowInFace * 3 + (c - 3);
        } else if (c >= 6 && c <= 8) {
          faceKey = 'R';
          idx = rowInFace * 3 + (c - 6);
        } else if (c >= 9 && c <= 11) {
          faceKey = 'B';
          idx = rowInFace * 3 + (c - 9);
        }
      } else if (r >= 6 && r <= 8 && c >= 3 && c <= 5) {
        faceKey = 'D';
        idx = (r - 6) * 3 + (c - 3);
      }

      if (faceKey !== null) {
        cell.dataset.face = faceKey;
        cell.dataset.index = idx;
        cell.classList.add(`net-cell-${faceKey}-${idx}`);
        cell.addEventListener('click', () => handleStickerClick(faceKey, idx));
      } else {
        cell.classList.add('empty');
      }

      netGrid.appendChild(cell);
    }
  }
}

/* -------------------------------------------------------------
   STICKER CLICK / PAINT / CYCLE
------------------------------------------------------------- */
function handleStickerClick(faceKey, idx) {
  const currentVal = cubeState[faceKey][idx];

  if (selectedBrushColor) {
    // If a brush is active, paint with that color
    cubeState[faceKey][idx] = selectedBrushColor;
  } else {
    // Otherwise cycle through colors
    const curIdx = COLORS.findIndex(c => c.id === currentVal);
    const nextIdx = (curIdx + 1) % COLORS.length;
    cubeState[faceKey][idx] = COLORS[nextIdx].id;
  }

  updateAllVisuals();
  checkConstraintWarning(true);
}

/* -------------------------------------------------------------
   UPDATE VISUALS & LIVE COUNTERS
------------------------------------------------------------- */
function updateAllVisuals() {
  const counts = { W: 0, Y: 0, R: 0, O: 0, B: 0, G: 0 };

  FACES.forEach(faceKey => {
    for (let i = 0; i < 9; i++) {
      const colorId = cubeState[faceKey][i];
      if (colorId && counts[colorId] !== undefined) {
        counts[colorId]++;
      }
      const hex = colorId && COLOR_MAP_BY_ID[colorId] ? COLOR_MAP_BY_ID[colorId].hex : '#334155';

      // 3D sticker
      const sticker3D = document.querySelector(`.sticker-${faceKey}-${i}`);
      if (sticker3D) sticker3D.style.backgroundColor = hex;

      // 2D Net cell
      const netCell = document.querySelector(`.net-cell-${faceKey}-${i}`);
      if (netCell) netCell.style.backgroundColor = hex;
    }
  });

  renderCounterList(counts);
}

/* -------------------------------------------------------------
   CONSTRAINT TRACKER & NOTIFICATION (Requirement #3)
   "add like a notification constraint which pops up if there
    are more than 9 cells having same colour"
------------------------------------------------------------- */
function renderCounterList(counts) {
  const container = document.getElementById('counter-list');
  container.innerHTML = '';

  let hasViolation = false;

  COLORS.forEach(color => {
    const count = counts[color.id] || 0;
    const isViolated = count > 9;
    const isExact = count === 9;
    if (isViolated) hasViolation = true;

    const item = document.createElement('div');
    item.className = `counter-item ${isViolated ? 'violated' : ''} ${isExact ? 'solved-exact' : ''}`;

    const colorLabel = document.createElement('span');
    colorLabel.className = 'color-name';
    colorLabel.innerHTML = `<span class="counter-color-dot" style="background:${color.hex};"></span>${color.name}`;

    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = isViolated ? `${count}/9 ⚠️` : `${count}/9`;

    item.appendChild(colorLabel);
    item.appendChild(badge);
    container.appendChild(item);
  });

  // Enable/Disable Solve button if constraint violated
  const solveBtn = document.getElementById('btn-solve');
  if (hasViolation) {
    solveBtn.disabled = true;
    solveBtn.title = 'Cannot solve: one or more colours exceed the 9-cell limit';
  } else {
    solveBtn.disabled = false;
    solveBtn.title = 'Ready to solve';
  }
}

function checkConstraintWarning(isUserAction = false) {
  const counts = { W: 0, Y: 0, R: 0, O: 0, B: 0, G: 0 };
  FACES.forEach(f => {
    cubeState[f].forEach(c => {
      if (c && counts[c] !== undefined) counts[c]++;
    });
  });

  const violations = [];

  // 1. Color count constraint (more than 9 cells)
  COLORS.forEach(c => {
    if (counts[c.id] > 9) {
      violations.push({
        type: 'count',
        message: `Colour ${c.name} has ${counts[c.id]} cells (exceeds limit of 9 by +${counts[c.id] - 9})`
      });
    }
  });

  // 2. Duplicate centers constraint
  const centerMap = {};
  FACES.forEach(f => {
    const centerColor = cubeState[f][4];
    if (centerColor) {
      if (centerMap[centerColor]) {
        const colorName = COLOR_MAP_BY_ID[centerColor]?.name || centerColor;
        violations.push({
          type: 'center',
          message: `Faces '${centerMap[centerColor]}' and '${f}' both have ${colorName} centres (Centres must all be distinct)`
        });
      } else {
        centerMap[centerColor] = f;
      }
    }
  });

  if (violations.length > 0) {
    showConstraintModal(violations);
  } else {
    hideConstraintModal();
  }
}

function showConstraintModal(violations) {
  const modal = document.getElementById('constraint-modal');
  const details = document.getElementById('modal-details');

  let text = '';
  violations.forEach(v => {
    text += `• ${v.message}\n`;
  });
  details.innerText = text;

  modal.classList.remove('hidden');
}

function hideConstraintModal() {
  document.getElementById('constraint-modal').classList.add('hidden');
}

function setupModal() {
  document.getElementById('modal-close-btn').addEventListener('click', hideConstraintModal);
  document.getElementById('modal-balance-btn').addEventListener('click', () => {
    hideConstraintModal();
    randomizeCube();
  });
}

/* -------------------------------------------------------------
   RANDOMIZE CONTROLS (Requirement #2)
   Strictly enforces:
   1. Exactly 9 cells per colour across the cube.
   2. All 6 face centres have unique, distinct colours.
------------------------------------------------------------- */
function setupActionButtons() {
  // 1. Randomize Cube: 25 legal moves from solved (guaranteed 9x6 + unique centres + solvable)
  document.getElementById('btn-randomize').addEventListener('click', () => {
    randomizeCube();
  });

  // 2. Shuffle Stickers: Random permutation with 6 unique centres and exactly 9 of each colour
  document.getElementById('btn-shuffle-stickers').addEventListener('click', () => {
    shuffleStickers();
  });

  // 3. Reset to Solved Cube
  document.getElementById('btn-reset-solved').addEventListener('click', () => {
    resetSolved();
  });

  // 4. Clear All (for manual one-by-one input)
  document.getElementById('btn-clear').addEventListener('click', () => {
    clearAll();
  });

  // 5. Solve Cube
  document.getElementById('btn-solve').addEventListener('click', () => {
    solveCube();
  });

  // 6. Copy Solution Moves
  document.getElementById('btn-copy-solution').addEventListener('click', () => {
    const text = document.getElementById('solution-moves').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy-solution');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Moves'; }, 2000);
    });
  });

  // Toggle 3D vs 2D
  const btn3D = document.getElementById('view-3d-btn');
  const btn2D = document.getElementById('view-2d-btn');
  const sceneCont = document.getElementById('scene-container');
  const netCont = document.getElementById('net-container');

  btn3D.addEventListener('click', () => {
    btn3D.classList.add('active');
    btn2D.classList.remove('active');
    sceneCont.classList.remove('hidden');
    netCont.classList.add('hidden');
  });

  btn2D.addEventListener('click', () => {
    btn2D.classList.add('active');
    btn3D.classList.remove('active');
    netCont.classList.remove('hidden');
    sceneCont.classList.add('hidden');
  });
}

/** Apply a clockwise 90-degree turn to a face */
function rotateFaceClockwise(faceArr) {
  return [
    faceArr[6], faceArr[3], faceArr[0],
    faceArr[7], faceArr[4], faceArr[1],
    faceArr[8], faceArr[5], faceArr[2]
  ];
}

/** Simulate a single legal move on the cube */
function applyCubeTurn(move) {
  if (move === 'U') {
    cubeState.U = rotateFaceClockwise(cubeState.U);
    const temp = [cubeState.F[0], cubeState.F[1], cubeState.F[2]];
    cubeState.F[0] = cubeState.R[0]; cubeState.F[1] = cubeState.R[1]; cubeState.F[2] = cubeState.R[2];
    cubeState.R[0] = cubeState.B[0]; cubeState.R[1] = cubeState.B[1]; cubeState.R[2] = cubeState.B[2];
    cubeState.B[0] = cubeState.L[0]; cubeState.B[1] = cubeState.L[1]; cubeState.B[2] = cubeState.L[2];
    cubeState.L[0] = temp[0]; cubeState.L[1] = temp[1]; cubeState.L[2] = temp[2];
  } else if (move === 'D') {
    cubeState.D = rotateFaceClockwise(cubeState.D);
    const temp = [cubeState.F[6], cubeState.F[7], cubeState.F[8]];
    cubeState.F[6] = cubeState.L[6]; cubeState.F[7] = cubeState.L[7]; cubeState.F[8] = cubeState.L[8];
    cubeState.L[6] = cubeState.B[6]; cubeState.L[7] = cubeState.B[7]; cubeState.L[8] = cubeState.B[8];
    cubeState.B[6] = cubeState.R[6]; cubeState.B[7] = cubeState.R[7]; cubeState.B[8] = cubeState.R[8];
    cubeState.R[6] = temp[0]; cubeState.R[7] = temp[1]; cubeState.R[8] = temp[2];
  } else if (move === 'F') {
    cubeState.F = rotateFaceClockwise(cubeState.F);
    const temp = [cubeState.U[6], cubeState.U[7], cubeState.U[8]];
    cubeState.U[6] = cubeState.L[8]; cubeState.U[7] = cubeState.L[5]; cubeState.U[8] = cubeState.L[2];
    cubeState.L[2] = cubeState.D[0]; cubeState.L[5] = cubeState.D[1]; cubeState.L[8] = cubeState.D[2];
    cubeState.D[0] = cubeState.R[6]; cubeState.D[1] = cubeState.R[3]; cubeState.D[2] = cubeState.R[0];
    cubeState.R[0] = temp[0]; cubeState.R[3] = temp[1]; cubeState.R[6] = temp[2];
  } else if (move === 'B') {
    cubeState.B = rotateFaceClockwise(cubeState.B);
    const temp = [cubeState.U[0], cubeState.U[1], cubeState.U[2]];
    cubeState.U[0] = cubeState.R[2]; cubeState.U[1] = cubeState.R[5]; cubeState.U[2] = cubeState.R[8];
    cubeState.R[2] = cubeState.D[8]; cubeState.R[5] = cubeState.D[7]; cubeState.R[8] = cubeState.D[6];
    cubeState.D[6] = cubeState.L[0]; cubeState.D[7] = cubeState.L[3]; cubeState.D[8] = cubeState.L[6];
    cubeState.L[0] = temp[2]; cubeState.L[3] = temp[1]; cubeState.L[6] = temp[0];
  } else if (move === 'R') {
    cubeState.R = rotateFaceClockwise(cubeState.R);
    const temp = [cubeState.U[2], cubeState.U[5], cubeState.U[8]];
    cubeState.U[2] = cubeState.F[2]; cubeState.U[5] = cubeState.F[5]; cubeState.U[8] = cubeState.F[8];
    cubeState.F[2] = cubeState.D[2]; cubeState.F[5] = cubeState.D[5]; cubeState.F[8] = cubeState.D[8];
    cubeState.D[2] = cubeState.B[6]; cubeState.D[5] = cubeState.B[3]; cubeState.D[8] = cubeState.B[0];
    cubeState.B[0] = temp[2]; cubeState.B[3] = temp[1]; cubeState.B[6] = temp[0];
  } else if (move === 'L') {
    cubeState.L = rotateFaceClockwise(cubeState.L);
    const temp = [cubeState.U[0], cubeState.U[3], cubeState.U[6]];
    cubeState.U[0] = cubeState.B[8]; cubeState.U[3] = cubeState.B[5]; cubeState.U[6] = cubeState.B[2];
    cubeState.B[2] = cubeState.D[6]; cubeState.B[5] = cubeState.D[3]; cubeState.B[8] = cubeState.D[0];
    cubeState.D[0] = cubeState.F[0]; cubeState.D[3] = cubeState.F[3]; cubeState.D[6] = cubeState.F[6];
    cubeState.F[0] = temp[0]; cubeState.F[3] = temp[1]; cubeState.F[6] = temp[2];
  }
}

/** 1. Randomize Cube: 25 legal moves. Guarantees 9 of each color, unique centers, and solvable */
function randomizeCube() {
  resetSolved();
  const moves = ['U', 'D', 'F', 'B', 'L', 'R'];
  let lastMove = '';
  const numMoves = 25;

  for (let i = 0; i < numMoves; i++) {
    let mv;
    do {
      mv = moves[Math.floor(Math.random() * moves.length)];
    } while (mv === lastMove);
    lastMove = mv;

    const turns = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 turns
    for (let t = 0; t < turns; t++) {
      applyCubeTurn(mv);
    }
  }

  hideConstraintModal();
  updateAllVisuals();
}

/** 2. Sticker Shuffle: Distributes exactly 8 of each of the 6 colors to non-centers while keeping 6 distinct centers */
function shuffleStickers() {
  // Set distinct standard centers: U=White, F=Green, D=Yellow, R=Red, L=Orange, B=Blue
  cubeState.U[4] = 'W';
  cubeState.F[4] = 'G';
  cubeState.D[4] = 'Y';
  cubeState.R[4] = 'R';
  cubeState.L[4] = 'O';
  cubeState.B[4] = 'B';

  // Deck of exactly 48 stickers (8 of each of the 6 colours)
  const deck = [];
  COLORS.forEach(c => {
    for (let i = 0; i < 8; i++) {
      deck.push(c.id);
    }
  });

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // Assign to all non-center stickers (indices 0,1,2,3, 5,6,7,8)
  let idx = 0;
  FACES.forEach(faceKey => {
    for (let i = 0; i < 9; i++) {
      if (i !== 4) {
        cubeState[faceKey][i] = deck[idx++];
      }
    }
  });

  hideConstraintModal();
  updateAllVisuals();
}

/** Reset to solved configuration */
function resetSolved() {
  cubeState = {
    U: new Array(9).fill('W'),
    F: new Array(9).fill('G'),
    D: new Array(9).fill('Y'),
    R: new Array(9).fill('R'),
    L: new Array(9).fill('O'),
    B: new Array(9).fill('B'),
  };
  updateAllVisuals();
  checkConstraintWarning(false);
}

/** Clear all stickers */
function clearAll() {
  FACES.forEach(f => {
    cubeState[f] = new Array(9).fill(null);
  });
  updateAllVisuals();
  checkConstraintWarning(false);
}

/* -------------------------------------------------------------
   3D ORBIT & CAMERA CONTROLS (Requirement #1)
------------------------------------------------------------- */
let currentZoom = 1.0;

function setupOrbitControls() {
  const sceneContainer = document.getElementById('scene-container');
  const cubeElem = document.getElementById('cube-3d');

  function updateTransform(smooth = false) {
    if (smooth) {
      cubeElem.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => { cubeElem.style.transition = 'transform 0.05s ease-out'; }, 320);
    }
    cubeElem.style.transform = `scale(${currentZoom}) rotateX(${currentRotation.x}deg) rotateY(${currentRotation.y}deg)`;
  }

  updateTransform();

  // Mouse drag rotation
  sceneContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.scene-controls-overlay') || 
        e.target.closest('.zoom-controls-overlay') || 
        e.target.classList.contains('sticker')) return;
    isDragging = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    if (autoSpinInterval) stopAutoSpin();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;

    currentRotation.y += dx * 0.5;
    currentRotation.x -= dy * 0.5;
    currentRotation.x = Math.max(-85, Math.min(85, currentRotation.x));

    lastMousePos = { x: e.clientX, y: e.clientY };
    updateTransform();
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  // Mouse wheel zoom
  sceneContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    currentZoom = Math.max(0.6, Math.min(1.5, currentZoom + delta));
    updateTransform();
  }, { passive: false });

  // Touch support for mobile/trackpads
  sceneContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && !e.target.closest('.scene-controls-overlay') && !e.target.closest('.zoom-controls-overlay')) {
      isDragging = true;
      lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (autoSpinInterval) stopAutoSpin();
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMousePos.x;
    const dy = e.touches[0].clientY - lastMousePos.y;

    currentRotation.y += dx * 0.6;
    currentRotation.x -= dy * 0.6;
    currentRotation.x = Math.max(-85, Math.min(85, currentRotation.x));

    lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    updateTransform();
  }, { passive: true });

  window.addEventListener('touchend', () => { isDragging = false; });

  // Floating D-pad arrow buttons
  document.getElementById('cam-turn-up')?.addEventListener('click', () => {
    if (autoSpinInterval) stopAutoSpin();
    currentRotation.x = Math.min(85, currentRotation.x + 30);
    updateTransform(true);
  });

  document.getElementById('cam-turn-down')?.addEventListener('click', () => {
    if (autoSpinInterval) stopAutoSpin();
    currentRotation.x = Math.max(-85, currentRotation.x - 30);
    updateTransform(true);
  });

  document.getElementById('cam-turn-left')?.addEventListener('click', () => {
    if (autoSpinInterval) stopAutoSpin();
    currentRotation.y -= 45;
    updateTransform(true);
  });

  document.getElementById('cam-turn-right')?.addEventListener('click', () => {
    if (autoSpinInterval) stopAutoSpin();
    currentRotation.y += 45;
    updateTransform(true);
  });

  document.getElementById('cam-reset')?.addEventListener('click', () => {
    if (autoSpinInterval) stopAutoSpin();
    currentRotation = { x: -28, y: 35 };
    currentZoom = 1.0;
    updateTransform(true);
  });

  // Zoom overlay buttons
  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    currentZoom = Math.min(1.5, currentZoom + 0.15);
    updateTransform(true);
  });

  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    currentZoom = Math.max(0.6, currentZoom - 0.15);
    updateTransform(true);
  });
}

function setupCameraPresets() {
  const cubeElem = document.getElementById('cube-3d');
  const presets = {
    iso: { x: -28, y: 35 },
    U:   { x: -90, y: 0 },
    D:   { x: 90,  y: 0 },
    F:   { x: 0,   y: 0 },
    B:   { x: 0,   y: 180 },
    L:   { x: 0,   y: 90 },
    R:   { x: 0,   y: -90 },
  };

  document.querySelectorAll('.cam-btn[data-rot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rot = presets[btn.dataset.rot];
      if (rot) {
        if (autoSpinInterval) stopAutoSpin();
        currentRotation = { ...rot };
        cubeElem.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        cubeElem.style.transform = `scale(${currentZoom}) rotateX(${currentRotation.x}deg) rotateY(${currentRotation.y}deg)`;
        setTimeout(() => { cubeElem.style.transition = 'transform 0.05s ease-out'; }, 450);
      }
    });
  });

  const spinBtn = document.getElementById('auto-spin-btn');
  spinBtn.addEventListener('click', () => {
    if (autoSpinInterval) {
      stopAutoSpin();
    } else {
      startAutoSpin();
    }
  });
}

function startAutoSpin() {
  const cubeElem = document.getElementById('cube-3d');
  const spinBtn = document.getElementById('auto-spin-btn');
  spinBtn.classList.add('active');
  autoSpinInterval = setInterval(() => {
    currentRotation.y += 0.8;
    cubeElem.style.transform = `scale(${currentZoom}) rotateX(${currentRotation.x}deg) rotateY(${currentRotation.y}deg)`;
  }, 20);
}

function stopAutoSpin() {
  clearInterval(autoSpinInterval);
  autoSpinInterval = null;
  const spinBtn = document.getElementById('auto-spin-btn');
  if (spinBtn) spinBtn.classList.remove('active');
}

/* -------------------------------------------------------------
   SOLVER INTEGRATION & BACKEND CONNECTION
------------------------------------------------------------- */
async function solveCube() {
  const statusEl = document.getElementById('solution-status');
  const placeholder = document.getElementById('solution-placeholder');
  const resultsBox = document.getElementById('solution-results');
  const movesBox = document.getElementById('solution-moves');
  const totalSteps = document.getElementById('total-steps');

  // 1. Check constraints
  const counts = { W: 0, Y: 0, R: 0, O: 0, B: 0, G: 0 };
  let hasEmpty = false;
  FACES.forEach(f => {
    cubeState[f].forEach(c => {
      if (!c) hasEmpty = true;
      else counts[c] = (counts[c] || 0) + 1;
    });
  });

  if (hasEmpty) {
    alert('Please fill all 54 cells before solving!');
    return;
  }

  for (const c of COLORS) {
    if (counts[c.id] > 9) {
      checkConstraintWarning(true);
      return;
    }
    if (counts[c.id] !== 9) {
      alert(`Constraint violation: Colour ${c.name} has ${counts[c.id]} cells. Each colour must have exactly 9 cells.`);
      return;
    }
  }

  // 2. Format 54-character string in solver order (U, F, D, R, L, B)
  const fullCubeString = FACES.map(f => cubeState[f].join('')).join('');

  statusEl.className = 'status-indicator solving';
  statusEl.textContent = 'Solving...';
  placeholder.textContent = 'Searching for optimal solution with Kociemba Two-Phase Algorithm...';
  placeholder.classList.remove('hidden');
  resultsBox.classList.add('hidden');

  try {
    // Attempt connection to the local solver backend
    const resp = await fetch('http://localhost:5000/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cube: fullCubeString })
    });

    const data = await resp.json();

    if (resp.ok && data.solution) {
      statusEl.className = 'status-indicator success';
      statusEl.textContent = 'Solved!';
      placeholder.classList.add('hidden');
      resultsBox.classList.remove('hidden');

      movesBox.textContent = data.solution;
      totalSteps.textContent = data.steps !== undefined ? data.steps : data.solution.split(' ').filter(Boolean).length;
    } else {
      throw new Error(data.error || 'Failed to solve');
    }
  } catch (err) {
    statusEl.className = 'status-indicator error';
    statusEl.textContent = 'Error';
    placeholder.classList.remove('hidden');
    placeholder.innerHTML = `
      <div style="color: #f87171; line-height: 1.5;">
        <strong>⚠️ Solver Error:</strong><br>
        ${err.message}<br><br>
        <span style="color: #94a3b8; font-size: 0.8rem;">
          Make sure the backend server is running via:<br>
          <code style="background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">python server.py</code>
        </span>
      </div>
    `;
  }
}
