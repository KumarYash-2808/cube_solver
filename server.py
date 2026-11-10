"""
Rubik's Cube Solver Backend Server
Connects the 3D Frontend to the Kociemba Two-Phase Solving Backend.
Preserves the exact center-detection and validation logic of the C++ codebase.
"""

import sys
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

try:
    import kociemba
except ImportError:
    kociemba = None

PORT = 5000

class SolverRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/solve':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                payload = json.loads(post_data.decode('utf-8'))
                raw_cube = payload.get('cube', '')

                if len(raw_cube) != 54:
                    self._send_json({'error': f'Cube string must have exactly 54 characters (got {len(raw_cube)})'}, 400)
                    return

                # Order from frontend: U(9), F(9), D(9), R(9), L(9), B(9)
                Uraw = raw_cube[0:9]
                Fraw = raw_cube[9:18]
                Draw = raw_cube[18:27]
                Rraw = raw_cube[27:36]
                Lraw = raw_cube[36:45]
                Braw = raw_cube[45:54]

                # Center detection logic matching main.cpp lines 64-98
                Ucolour = Uraw[4]
                Fcolour = Fraw[4]
                Dcolour = Draw[4]
                Rcolour = Rraw[4]
                Lcolour = Lraw[4]
                Bcolour = Braw[4]

                centres = [Ucolour, Fcolour, Dcolour, Rcolour, Lcolour, Bcolour]
                if len(set(centres)) != 6:
                    self._send_json({'error': 'Two or more face centres have the same colour. All 6 centres must be distinct.'}, 400)
                    return

                # Check that each colour occurs exactly 9 times across the cube
                for c in set(raw_cube):
                    cnt = raw_cube.count(c)
                    if cnt != 9:
                        self._send_json({'error': f"Colour '{c}' occurs {cnt} times instead of 9 (Constraint violation)."}, 400)
                        return

                # Build colour -> face mapping (matching main.cpp lines 124-132)
                colour_to_face = {
                    Ucolour: 'U',
                    Rcolour: 'R',
                    Fcolour: 'F',
                    Dcolour: 'D',
                    Lcolour: 'L',
                    Bcolour: 'B'
                }

                # Convert into standard Kociemba 54-char string:
                # Kociemba standard order: U(9) + R(9) + F(9) + D(9) + L(9) + B(9)
                kociemba_input = ''.join([
                    ''.join(colour_to_face[c] for c in Uraw),
                    ''.join(colour_to_face[c] for c in Rraw),
                    ''.join(colour_to_face[c] for c in Fraw),
                    ''.join(colour_to_face[c] for c in Draw),
                    ''.join(colour_to_face[c] for c in Lraw),
                    ''.join(colour_to_face[c] for c in Braw),
                ])

                # Check if already solved
                solved_state = 'U'*9 + 'R'*9 + 'F'*9 + 'D'*9 + 'L'*9 + 'B'*9
                if kociemba_input == solved_state:
                    self._send_json({'solution': 'Cube is already solved!', 'steps': 0})
                    return

                # Solve using Kociemba algorithm
                if kociemba is None:
                    self._send_json({'error': 'kociemba Python package is not available. Install via: pip install kociemba'}, 500)
                    return

                solution_str = kociemba.solve(kociemba_input)
                moves = solution_str.strip().split()

                self._send_json({
                    'solution': solution_str,
                    'steps': len(moves),
                    'mapped': kociemba_input
                })

            except Exception as e:
                self._send_json({'error': f'Solving error: {str(e)}'}, 400)
        else:
            self.send_error(404, 'Endpoint not found')

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

import os
import functools

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), 'frontend')
if not os.path.exists(FRONTEND_DIR):
    FRONTEND_DIR = os.path.dirname(__file__)

if __name__ == '__main__':
    print(f"Starting Rubik's Cube Solver Server on http://localhost:{PORT}")
    print("Serving 3D frontend and /solve API endpoint...")
    HTTPServer.allow_reuse_address = True
    handler = functools.partial(SolverRequestHandler, directory=FRONTEND_DIR)
    server = HTTPServer(('127.0.0.1', PORT), handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()
