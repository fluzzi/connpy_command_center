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

The Command Center is configured primarily through environment variables.

| Variable Name | Required | Default Value | Description |
|---|---|---|---|
| `CONN_API_KEY` | Yes (in prod) | `connpy-dev-key-12345` (only in dev) | Pre-shared API Key to validate gateway requests from the frontend client. In production, this must be explicitly set to a secure secret. |
| `CONNPY_API_URL` | No | `127.0.0.1:8048` | The address of the backend `connpy` gRPC API server. |
| `CONN_DEV` | No | `None` | Set to `1` to run the server in development mode (enables localhost dev servers and insecure default fallback keys). |
| `CONN_SSO_GATEWAY_SECRET` | No | `default-sso-gateway-secret-12345` | Key used to sign local forward authentication exchanges. Must match backend `config.yaml` SSO secret. |
| `CONN_SSO_<PROVIDER>_CLIENT_ID` | No | `None` | The Client ID for OIDC/SSO authorization (e.g. `CONN_SSO_GOOGLE_CLIENT_ID`). |
| `CONN_SSO_<PROVIDER>_CLIENT_SECRET` | No | `None` | The Client Secret for OIDC/SSO authorization code exchanges (e.g. `CONN_SSO_GOOGLE_CLIENT_SECRET`). |
| `CONN_SSO_<PROVIDER>_AUTH_URL` | No | `None` | The login authorization URL of the provider (e.g. `CONN_SSO_GOOGLE_AUTH_URL`). |
| `CONN_SSO_<PROVIDER>_TOKEN_URL` | No | `None` | The token exchange endpoint URL of the provider (e.g. `CONN_SSO_GOOGLE_TOKEN_URL`). |
| `CONN_SSO_<PROVIDER>_SCOPE` | No | `openid email profile` | Scope parameter passed during SSO authorization redirects. |

*Note: For Vite/React client-side builds, Vite environment variables are prefixed with `VITE_` (e.g. `VITE_CONN_API_KEY` or `VITE_API_KEY` during compilation).*

### 🔐 SSO & Authentication Configuration

#### 1. Forward Authentication (Trusted Gateway / Authelia)
If the Command Center runs behind an SSO proxy (such as Authelia, Traefik Forward Auth, or Cloudflare Access) that populates `Remote-User` or `X-Forwarded-User` headers:
*   Configure the **`CONN_SSO_GATEWAY_SECRET`** environment variable in the middleware. In production, this variable must be set to a secure, random secret (startup will crash if it's missing).
*   Add the `trusted_gateway` provider to the global `connpy` configuration on the backend server:
    ```bash
    conn sso --add trusted_gateway
    ```
    *Note: The `trusted_gateway` configuration must include the secret matching the middleware's secret key (either as a plaintext string or referencing an environment variable with `$` prefix).*

#### 2. Domain Allow-lists (`allowed_domains`)
You can restrict access to SSO logins based on the user's email domain. This is configured in `connpy`'s `config.yaml` on the backend server per provider:
```yaml
sso:
  providers:
    google:
      jwks_url: "https://www.googleapis.com/oauth2/v3/certs"
      allowed_domains:
        - yyy.com
        - company.org
```
*   **Behavior**:
    *   If `allowed_domains` is omitted or empty, **all** domains are allowed to register/login (default).
    *   If defined, the backend will parse the OIDC ID token, extract the email claim (`email` or fallback to domain matching), and abort authentication if the domain does not match any items in the list.


## 📜 License

[PolyForm Noncommercial 1.0.0](LICENSE)
