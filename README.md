# 🛡️ Connpy Command Center

The **Command Center** is a modern, real-time web dashboard for [connpy](https://github.com/fluzzi/connpy). It provides a high-performance interface to manage nodes, execute playbooks, and monitor network infrastructure with a premium visual experience.

## 🏗️ Architecture

The system follows a three-tier architecture:

1.  **Frontend (React/Vite)**: A sleek, dark-themed dashboard built with React, Tailwind CSS, and Xterm.js for real-time terminal interactions.
2.  **Middleware (FastAPI)**: A Python bridge that handles authentication, API requests, and WebSocket streaming.
3.  **Core (gRPC)**: The middleware communicates with the `connpy` gRPC server to perform actual network operations.

## 🚀 Getting Started

### Prerequisites

-   Python 3.10+
-   Node.js 18+ & npm
-   A running `connpy` gRPC server (`connpy api --debug`)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/youruser/command_center.git
    cd command_center
    ```

2.  **Install Middleware dependencies**:
    ```bash
    pip install -r middleware/requirements.txt
    ```

3.  **Install Frontend dependencies**:
    ```bash
    cd frontend
    npm install
    cd ..
    ```

## 🛠️ Usage

### Quick Start (Development)

You can run both the middleware and the frontend development server using the provided Python helper:

```bash
python command_center.py --dev
```
-   **Dashboard**: `http://localhost:5173`
-   **API/Middleware**: `http://localhost:8000`

### Production Deployment

1.  **Build the frontend**:
    ```bash
    python command_center.py --build
    ```
    This generates a `dist/` folder in the frontend directory.

2.  **Run the integrated server**:
    ```bash
    python command_center.py --start
    ```
    The middleware will serve the built frontend automatically on port `8000`.

## ⚙️ Configuration

-   **API Key**: The middleware uses an API Key for security. It reads it from `frontend/.env` (VITE_API_KEY).
-   **gRPC Target**: By default, it looks for `connpy` at `127.0.0.1:8048`. You can change this using the `-g` flag.

## 📜 License

[PolyForm Noncommercial 1.0.0](LICENSE)
