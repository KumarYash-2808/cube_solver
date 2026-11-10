# 🧊 3D Rubik's Cube Solver

An interactive, full-stack Rubik's Cube Solver combining **Herbert Kociemba's Two-Phase Algorithm** (with IDA* heuristic search) and a modern **3D Web Interface** with real-time constraint validation and camera controls.

---

## 🌟 Features

### 🎮 Interactive 3D Frontend
* **Realistic 3D Perspective**: Built using CSS 3D transforms (`transform-style: preserve-3d`) for smooth, hardware-accelerated 3D rendering.
* **Camera & View Controls**:
  * **Free Orbital Drag**: Click and drag with mouse or swipe on touchscreens to orbit around all faces.
  * **Mouse Wheel Zoom**: Scroll to zoom smoothly in and out (`0.6×` to `1.5×`).
  * **On-Screen D-Pad**: Floating directional arrows (`▲`, `▼`, `◀`, `▶`) and zoom controls (`+`, `−`).
  * **Face Camera Presets**: One-click camera snaps for `Isometric`, `U` (Up), `F` (Front), `R` (Right), `B` (Back), `L` (Left), and `D` (Down).
  * **360° Auto-Spin**: Continuous showcase mode.
  * **Dual View**: Toggle between 3D Cube View and an unfolded 2D Net View.
* **Palette & Painting**:
  * Color brush palette for White, Green, Yellow, Red, Orange, and Blue.
  * Click any cell to cycle colors or paint directly with the brush.

### ⚡ Constraint-Safe Randomizer & Scrambler
* **`🎲 Randomize Cube`**: Applies 25 legal, physical face turns (`R`, `U'`, `F2`, etc.) from the solved state. Guarantees:
  * Exactly 9 of each color across the cube (zero constraint violations).
  * All 6 face centers remain distinct.
  * 100% physically valid and guaranteed solvable by Kociemba's algorithm.
* **`🔀 Shuffle Stickers (9x6)`**: Randomly permutes non-center stickers while preserving exactly 9 of each color and 6 unique centers.

### ⚠️ Real-Time Constraint Validation & Alert System
* **Live Counter Badges**: Real-time counter pills for all 6 colors (`X/9`).
* **Constraint Violation Alert Modal**: Immediately pops up if:
  * Any color count exceeds 9 cells (e.g., from manual coloring).
  * Two face centers share the same color.
* **Auto-Balance**: One-click recovery inside the modal to restore valid counts.
* **Safety Lock**: Disables solving when physical constraints are violated to avoid submitting impossible cube states.

### 🧠 Herbert Kociemba's Two-Phase Algorithm Backend
* **Phase 1 ($G_0 \to G_1$)**: Orients all corners and edges, placing E-slice edges into the E-slice using all 18 moves.
* **Phase 2 ($G_1 \to \text{Solved}$)**: Solves the cube completely within subgroup $G_1$ using moves $\{U, U2, U', D, D2, D', L2, R2, F2, B2\}$.
* **IDA\* Search**: Guided by precomputed pruning tables (`twist_slice`, `flip_slice`, `cp_slice`, `udedge_slice`).

---

## 📁 Repository Structure

```text
cube-solver/
├── backend/                  # C++ Kociemba Two-Phase Solver
│   ├── bfstable/             # BFS heuristic table generator & encoder
│   ├── inputproc/            # Sticker-to-cubie conversion & parity validation
│   ├── kociemba/             # Phase 1 & Phase 2 IDA* search
│   ├── rubicsmove/           # 18-move cube transformation engine
│   ├── tables/               # Precomputed binary pruning tables
│   ├── cube_solver           # Compiled Linux binary
│   ├── main.cpp              # Interactive console solver entrypoint
│   └── README.md             # Backend architecture documentation
├── frontend/                 # 3D Interactive Web Application
│   ├── index.html            # Web markup & controls layout
│   ├── style.css             # 3D perspective, glassmorphism UI & animations
│   └── script.js             # 3D orbit engine, constraint validator & randomizer
├── server.py                 # Python HTTP server & Kociemba API bridge
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/KumarYash-2808/cube-solver.git
cd cube-solver
```

### 2. Prerequisites
* **Python 3.8+**
* Install the Python `kociemba` solver library:
  ```bash
  pip install kociemba
  ```

### 3. Launch the Application
Run the unified server from the project root:
```bash
python server.py
```
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 🛠️ Compiling the C++ Backend (Optional)

If you wish to run the interactive console C++ solver directly:

### On Linux / macOS / WSL:
```bash
cd backend
g++ -std=c++17 -O2 \
    main.cpp \
    inputproc/*.cpp \
    rubicsmove/*.cpp \
    bfstable/*.cpp \
    kociemba/*.cpp \
    -lncurses \
    -o cube_solver

./cube_solver
```

---

## 🎮 Move Notation

| Symbol | Turn Description |
|:---:|---|
| **U, D, L, R, F, B** | 90° clockwise face turn |
| **U', D', L', R', F', B'** | 90° counter-clockwise face turn |
| **U2, D2, L2, R2, F2, B2** | 180° double turn |

---

## 📜 License
MIT License. Created by [KumarYash-2808](https://github.com/KumarYash-2808).
