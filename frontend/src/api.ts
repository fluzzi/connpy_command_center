const getApiPort = () => {
    // If running under Vite dev server (usually 5173-517X), assume backend is on 8000
    if (window.location.port.startsWith('517')) {
        return '8000';
    }
    // Otherwise, use the port the app was served from (Uvicorn serves both)
    return window.location.port;
};

export const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}${getApiPort() ? ':' + getApiPort() : ''}`;
export const API_KEY = import.meta.env.VITE_API_KEY || 'connpy-dev-key-12345';

export const getHeaders = () => {
    const token = localStorage.getItem('connpy_session_token');
    return {
        'Authorization': `Bearer ${token || API_KEY}`,
        'Content-Type': 'application/json'
    };
};

const getAuthParam = () => {
    const token = localStorage.getItem('connpy_session_token');
    if (token) {
        return { name: 'token', value: token };
    }
    return { name: 'api_key', value: API_KEY };
};

export const api = {
    generateSessionId: () => {
        const now = new Date();
        const ts = now.getFullYear() +
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getDate()).padStart(2, '0') + "-" +
                   String(now.getHours()).padStart(2, '0') +
                   String(now.getMinutes()).padStart(2, '0') +
                   String(now.getSeconds()).padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 6);
        return `web-${ts}-${random}`;
    },

    getActiveSessionId: () => {
        let currentSessionId = localStorage.getItem('active_ai_session');
        if (!currentSessionId) {
            currentSessionId = api.generateSessionId();
            localStorage.setItem('active_ai_session', currentSessionId);
        }
        return currentSessionId;
    },

    getAuthStatus: () => fetch(`${API_BASE}/api/auth/status`).then(r => r.json()),

    getMe: () => fetch(`${API_BASE}/api/auth/me`, { headers: getHeaders() }).then(async r => {
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to fetch identity');
        }
        return r.json();
    }),

    login: (username: string, password: string) => fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    }).then(async r => {
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || 'Login failed');
        }
        return r.json();
    }),

    getInventory: () => fetch(`${API_BASE}/api/inventory`, { headers: getHeaders() }).then(r => r.json()),
    
    getNodeDetails: (nodeId: string) => fetch(`${API_BASE}/api/node/${encodeURIComponent(nodeId)}`, { headers: getHeaders() }).then(r => r.json()),
    
    awsInfo: () => fetch(`${API_BASE}/api/aws/info`, { method: 'POST', headers: getHeaders() }).then(r => r.json()),
    
    awsInventory: (profile: string, region: string) => fetch(`${API_BASE}/api/aws/inventory`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ profile, region })
    }).then(r => r.json()),
    
    awsInspect: (profile: string, region: string, asset_id: string, filter_ip: string | null = null) => fetch(`${API_BASE}/api/aws/inspect`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ profile, region, identifier: asset_id, filter_ip })
    }).then(r => r.json()),

    awsFlowLog: (profile: string, region: string, eni_id: string | null, fl_id: string | null, time_range_hours: number, filter: string | null = null) => fetch(`${API_BASE}/api/aws/flowlog/view`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ profile, region, identifier: eni_id, fl_id, hours: time_range_hours, filter })
    }).then(r => r.json()),

    awsMetrics: (profile: string, region: string, identifier: string, metric_type: 'bw' | 'pps', time: number = 1, unit: string = 'mbps') => fetch(`${API_BASE}/api/aws/metrics`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ profile, region, identifier, metric_type, time, unit })
    }).then(r => r.json()),

    getWsBaseUrl: () => {
        if (import.meta.env.VITE_API_URL) {
            return import.meta.env.VITE_API_URL.replace(/^http/, 'ws');
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = getApiPort();
        return `${protocol}//${host}${port ? ':' + port : ''}`;
    },

    getAwsFlowLogWsUrl: () => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/aws/flowlog`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    },

    getAiWsUrl: (workspaceId: string | null) => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/ai`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        
        // Use workspaceId if in co-op mode, otherwise use persistent local session
        const sessionId = workspaceId || api.getActiveSessionId();
        url.searchParams.append('session_id', sessionId);
        
        return url.toString();
    },

    getTerminalWsUrl: (nodeId: string, workspaceId: string | null) => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/terminal/${encodeURIComponent(nodeId)}`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        if (workspaceId) {
            url.searchParams.append('session_id', workspaceId);
        }
        return url.toString();
    },

    getPlaybookWsUrl: () => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/playbook`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    },

    getPlaybookBuilderWsUrl: () => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/playbook/builder`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    },

    getPlaybookAnalyzeWsUrl: () => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/playbook/analyze`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    },

    getPlaybookPreflightWsUrl: () => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/playbook/preflight`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    },

    runCommands: (nodes: string[], commands: string[], variables: any = {}, timeout: number = 10) => fetch(`${API_BASE}/api/run`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ nodes, commands, variables, timeout })
    }).then(r => r.json()),

    testCommands: (nodes: string[], commands: string[], expected: string[], variables: any = {}, timeout: number = 10) => fetch(`${API_BASE}/api/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ nodes, commands, expected, variables, timeout })
    }).then(r => r.json()),

    getWorkspaceWsUrl: (workspaceId: string) => {
        const base = api.getWsBaseUrl();
        const url = new URL(`${base}/ws/workspace/${encodeURIComponent(workspaceId)}`);
        const auth = getAuthParam();
        url.searchParams.append(auth.name, auth.value);
        return url.toString();
    }
};
