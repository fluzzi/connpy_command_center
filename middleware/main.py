import asyncio
import os
import sys
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import grpc
from typing import AsyncGenerator, Dict, Set

# Add connpy root to sys.path to import its proto/grpc modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from connpy.grpc_layer import connpy_pb2, connpy_pb2_grpc, remote_plugin_pb2, remote_plugin_pb2_grpc
from google.protobuf.json_format import MessageToDict

app = FastAPI(title="Network Command Center Middleware")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = "connpy-dev-key-12345"
env_path = os.path.join(os.path.dirname(__file__), "../frontend/.env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("VITE_API_KEY="):
                API_KEY = line.split("=", 1)[1]

async def verify_api_key(api_key: str = Query(None), authorization: str = Header(None)):
    token = api_key
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return token

GRPC_SERVER_ADDRESS = os.getenv("CONNPY_GRPC_SERVER", "127.0.0.1:8048")

@app.get("/api/inventory", dependencies=[Depends(verify_api_key)])
async def get_inventory():
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.NodeServiceStub(channel)
        
        nodes_task = stub.list_nodes(connpy_pb2.FilterRequest(filter_str=""))
        folders_task = stub.list_folders(connpy_pb2.FilterRequest(filter_str=""))
        
        nodes_resp, folders_resp = await asyncio.gather(nodes_task, folders_task)
        
        nodes = []
        if nodes_resp.data.HasField("list_value"):
            nodes = [v.string_value for v in nodes_resp.data.list_value.values]
            
        folders = []
        if folders_resp.data.HasField("list_value"):
            folders = [v.string_value for v in folders_resp.data.list_value.values]
        
        return {
            "nodes": nodes,
            "folders": folders
        }

@app.get("/api/node/{node_id}", dependencies=[Depends(verify_api_key)])
async def get_node_details(node_id: str):
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.NodeServiceStub(channel)
        try:
            resp = await stub.get_node_details(connpy_pb2.IdRequest(id=node_id))
            return MessageToDict(resp.data)
        except grpc.aio.AioRpcError as e:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found: {e.details()}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/aws/info", dependencies=[Depends(verify_api_key)])
async def aws_info():
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {"command": "find", "__func_name__": "handle_info_command"}
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return json.loads("".join(output))
        except Exception as e:
            return {"error": str(e)}

@app.post("/api/aws/inventory")
async def aws_inventory(request: Request):
    data = await request.json()
    region = data.get("region")
    profile = data.get("profile")
    
    if not region or not profile:
        return {"error": "Both region and profile must be specified."}

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {
            "command": "inventory", 
            "region": region, 
            "profile": profile, 
            "verify_ssl": True, 
            "__func_name__": "handle_inventory_command"
        }
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return json.loads("".join(output))
        except Exception as e:
            return {"error": str(e)}
@app.post("/api/aws/inspect", dependencies=[Depends(verify_api_key)])
async def aws_inspect(request: Request):
    data = await request.json()
    identifier = data.get("identifier")
    profile = data.get("profile")
    region = data.get("region")
    
    filter_ip = data.get("filter_ip")
    
    if not identifier or not profile or not region:
        return {"error": "identifier, profile, and region are required."}

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {
            "command": "inspect", 
            "identifier": identifier,
            "profile": profile,
            "region": region,
            "filter_ip": filter_ip,
            "verify_ssl": True, 
            "__func_name__": "handle_inspect_command"
        }
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return {"output": "".join(output)}
        except Exception as e:
            return {"error": str(e)}

@app.post("/api/aws/flowlog/toggle", dependencies=[Depends(verify_api_key)])
async def aws_flowlog_toggle(request: Request):
    data = await request.json()
    identifier = data.get("identifier")
    action = data.get("action") # 'enable' or 'disable'
    profile = data.get("profile")
    region = data.get("region")
    
    if not identifier or not action or not profile or not region:
        return {"error": "identifier, action, profile, and region are required."}

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {
            "command": "flowlog-toggle", 
            "identifier": identifier,
            "action": action,
            "profile": profile,
            "region": region,
            "verify_ssl": True, 
            "__func_name__": "handle_flowlog_toggle_command"
        }
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return json.loads("".join(output))
        except Exception as e:
            return {"error": str(e)}

@app.post("/api/aws/metrics", dependencies=[Depends(verify_api_key)])
async def aws_metrics(request: Request):
    data = await request.json()
    identifier = data.get("identifier")
    profile = data.get("profile")
    region = data.get("region")
    metric_type = data.get("metric_type") # 'bw' or 'pps'
    
    try:
        time_hours = int(data.get("time", 1))
    except:
        time_hours = 1
        
    if not identifier or not profile or not region or not metric_type:
        return {"error": "identifier, profile, region, and metric_type are required."}

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        
        # Set up args based on metric type
        args = {
            "command": metric_type, 
            "instance_id": identifier,
            "time": time_hours,
            "profile": profile,
            "region": region,
            "verify_ssl": True, 
            "json_output": True,
            "__func_name__": "handle_bw_command" if metric_type == "bw" else "handle_pps_command"
        }
        
        if metric_type == "bw":
            args["unit"] = data.get("unit", "mbps")

        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return json.loads("".join(output))
        except Exception as e:
            return {"error": str(e)}

@app.post("/api/aws/flowlog/view", dependencies=[Depends(verify_api_key)])
async def aws_flowlog_view(request: Request):
    data = await request.json()
    identifier = data.get("identifier")
    fl_id = data.get("fl_id")
    profile = data.get("profile")
    region = data.get("region")
    
    try:
        hours = int(data.get("hours", 1))
    except:
        hours = 1
    filter_arg = data.get("filter")
    
    if not identifier or not fl_id or not profile or not region:
        return {"error": "identifier (ENI), fl_id, profile, and region are required."}

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {
            "command": "flowlog", 
            "eni_id": identifier,
            "fl_id": fl_id,
            "profile": profile,
            "region": region,
            "hours": hours,
            "filter": filter_arg,
            "verify_ssl": True,
            "__func_name__": "handle_flowlog_command"
        }
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        output = []
        try:
            async for chunk in stub.invoke_plugin(req):
                output.append(chunk.text)
            return {"output": "".join(output)}
        except Exception as e:
            return {"error": str(e)}

@app.websocket("/ws/aws/flowlog")
async def aws_flowlog_stream(websocket: WebSocket, api_key: str = Query(None)):
    await websocket.accept()
    if api_key != API_KEY:
        await websocket.close(code=1008)
        return
    
    try:
        data = await websocket.receive_json()
    except Exception:
        await websocket.close()
        return

    identifier = data.get("identifier")
    fl_id = data.get("fl_id")
    profile = data.get("profile")
    region = data.get("region")
    
    try:
        hours = int(data.get("hours", 1))
    except:
        hours = 1
    filter_arg = data.get("filter")
    
    if not identifier or not fl_id or not profile or not region:
        await websocket.send_json({"error": "identifier (ENI), fl_id, profile, and region are required."})
        await websocket.close()
        return

    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        args = {
            "command": "flowlog", 
            "eni_id": identifier,
            "fl_id": fl_id,
            "profile": profile,
            "region": region,
            "hours": hours,
            "filter": filter_arg,
            "follow": True,
            "interval": 5,
            "verify_ssl": True,
            "__func_name__": "handle_flowlog_command"
        }
        req = remote_plugin_pb2.PluginInvokeRequest(name="aws", args_json=json.dumps(args))
        
        try:
            call = stub.invoke_plugin(req)
            
            async def write_to_websocket():
                try:
                    async for chunk in call:
                        if chunk.text:
                            await websocket.send_json({"output": chunk.text})
                except Exception as e:
                    try:
                        await websocket.send_json({"error": str(e)})
                    except:
                        pass

            async def read_from_websocket():
                try:
                    while True:
                        await websocket.receive_text()
                except Exception:
                    pass

            read_task = asyncio.create_task(read_from_websocket())
            write_task = asyncio.create_task(write_to_websocket())
            
            done, pending = await asyncio.wait(
                [read_task, write_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
                
        except Exception as e:
            try:
                await websocket.send_json({"error": str(e)})
            except:
                pass
        finally:
            if websocket.client_state.name != "DISCONNECTED":
                try:
                    await websocket.close()
                except Exception:
                    pass

# --- WORKSPACE MANAGER ---
class WorkspaceManager:
    def __init__(self):
        # Maps session_id to dict: {'clients': set(WebSocket), 'tabs': list(str)}
        self.sessions: Dict[str, dict] = {}
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        async with self.lock:
            if session_id not in self.sessions:
                self.sessions[session_id] = {'clients': set(), 'tabs': []}
            self.sessions[session_id]['clients'].add(websocket)
            
            # Send current tabs to the new client
            current_tabs = self.sessions[session_id]['tabs']
            if current_tabs:
                await websocket.send_json({"type": "tabs_sync", "tabs": current_tabs})

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.sessions:
            if websocket in self.sessions[session_id]['clients']:
                self.sessions[session_id]['clients'].remove(websocket)
            if not self.sessions[session_id]['clients']:
                del self.sessions[session_id]

    async def broadcast_event(self, session_id: str, data: dict, sender: WebSocket):
        async with self.lock:
            if session_id in self.sessions:
                # Update internal state if it's a tab update
                if data.get("type") == "update_tabs":
                    self.sessions[session_id]['tabs'] = data.get("tabs", [])
                
                dead_clients = set()
                for client in self.sessions[session_id]['clients']:
                    if client != sender:
                        try:
                            await client.send_json(data)
                        except Exception:
                            dead_clients.add(client)
                for c in dead_clients:
                    self.sessions[session_id]['clients'].remove(c)

    def get_active_sessions(self):
        # Return sessions that have active clients
        return [sid for sid, data in self.sessions.items() if data['clients']]

workspace_manager = WorkspaceManager()

@app.get("/api/sessions", dependencies=[Depends(verify_api_key)])
async def get_sessions():
    return {"sessions": workspace_manager.get_active_sessions()}

@app.websocket("/ws/workspace/{session_id}")
async def workspace_websocket_endpoint(websocket: WebSocket, session_id: str):
    if websocket.query_params.get("api_key") != API_KEY:
        await websocket.close(code=1008)
        return
    await workspace_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_json()
            await workspace_manager.broadcast_event(session_id, data, websocket)
    except WebSocketDisconnect:
        workspace_manager.disconnect(websocket, session_id)
    except Exception:
        workspace_manager.disconnect(websocket, session_id)

# --- SHARED AI MANAGER ---
class SharedAIManager:
    def __init__(self):
        self.sessions = {}
        self.lock = asyncio.Lock()

    async def get_or_create_session(self, session_id: str):
        async with self.lock:
            if session_id not in self.sessions:
                channel = grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS)
                stub = connpy_pb2_grpc.AIServiceStub(channel)
                input_queue = asyncio.Queue()
                
                valid_fields = {f.name for f in connpy_pb2.AskRequest.DESCRIPTOR.fields}
                
                async def request_generator():
                    while True:
                        data = await input_queue.get()
                        if data is None: break
                        filtered_data = {k: v for k, v in data.items() if k in valid_fields}
                        yield connpy_pb2.AskRequest(**filtered_data)

                call = stub.ask(request_generator())
                
                session = {
                    'clients': set(),
                    'input_queue': input_queue,
                    'history': [], # Buffer of AI thoughts for late-joiners
                    'channel': channel,
                    'call': call,
                    'task': None
                }
                
                async def broadcast_task():
                    try:
                        async for response in call:
                            resp_dict = {
                                "text_chunk": response.text_chunk,
                                "is_final": response.is_final,
                                "status_update": response.status_update,
                                "debug_message": response.debug_message,
                                "requires_confirmation": response.requires_confirmation,
                                "important_message": response.important_message,
                                "full_result": MessageToDict(response.full_result) if response.is_final else None
                            }
                            
                            if response.status_update.startswith("__RESPONDER__:"):
                                session['current_responder'] = response.status_update.split(":")[1]
                            
                            resp_dict['responder'] = session.get('current_responder', 'engineer')
                            
                            # Keep history bounded
                            session['history'].append(resp_dict)
                            if len(session['history']) > 500:
                                session['history'] = session['history'][-500:]
                            
                            dead_clients = set()
                            for client in session['clients']:
                                try:
                                    await client.send_json(resp_dict)
                                except Exception:
                                    dead_clients.add(client)
                            for c in dead_clients:
                                session['clients'].remove(c)
                    except Exception as e:
                        print(f"Error in shared AI session {session_id}: {e}")
                    finally:
                        await self.cleanup_session(session_id)
                        
                session['task'] = asyncio.create_task(broadcast_task())
                self.sessions[session_id] = session
            return self.sessions[session_id]

    async def cleanup_session(self, session_id: str):
        async with self.lock:
            if session_id in self.sessions:
                session = self.sessions[session_id]
                await session['input_queue'].put(None)
                if session['task'] and session['task'] is not asyncio.current_task():
                    session['task'].cancel()
                await session['channel'].close()
                del self.sessions[session_id]

shared_ai_manager = SharedAIManager()

@app.websocket("/ws/ai")
async def ai_websocket_endpoint(websocket: WebSocket):
    if websocket.query_params.get("api_key") != API_KEY:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    session_id = websocket.query_params.get("session_id")
    
    if session_id:
        session = await shared_ai_manager.get_or_create_session(session_id)
        session['clients'].add(websocket)
        
        # Send AI history to late-joiners
        for msg in session['history']:
            try:
                await websocket.send_json(msg)
            except Exception:
                pass
                
        try:
            while True:
                data = await websocket.receive_json()
                if "input_text" in data:
                    # Broadcast the operator's message to other clients
                    op_msg = {
                        "is_operator": True,
                        "content": data["input_text"]
                    }
                    session['history'].append(op_msg)
                    if len(session['history']) > 500:
                        session['history'] = session['history'][-500:]
                    
                    dead_clients = set()
                    for client in session['clients']:
                        if client != websocket:
                            try:
                                await client.send_json(op_msg)
                            except Exception:
                                dead_clients.add(client)
                    for c in dead_clients:
                        session['clients'].remove(c)
                
                await session['input_queue'].put(data)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            import traceback
            traceback.print_exc()
        finally:
            if websocket in session['clients']:
                session['clients'].remove(websocket)
            if not session['clients']:
                await shared_ai_manager.cleanup_session(session_id)
            if websocket.client_state.name != "DISCONNECTED":
                try:
                    await websocket.close()
                except Exception:
                    pass
        return

    # Private AI Session (Default)
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.AIServiceStub(channel)
        input_queue = asyncio.Queue()
        
        valid_fields = {f.name for f in connpy_pb2.AskRequest.DESCRIPTOR.fields}
        
        async def request_generator():
            while True:
                data = await input_queue.get()
                if data is None: break
                filtered_data = {k: v for k, v in data.items() if k in valid_fields}
                yield connpy_pb2.AskRequest(**filtered_data)

        async def read_from_websocket():
            try:
                while True:
                    data = await websocket.receive_json()
                    await input_queue.put(data)
            except Exception:
                await input_queue.put(None)

        async def write_to_websocket():
            try:
                call = stub.ask(request_generator())
                current_responder = "engineer"
                async for response in call:
                    resp_dict = {
                        "text_chunk": response.text_chunk,
                        "is_final": response.is_final,
                        "status_update": response.status_update,
                        "debug_message": response.debug_message,
                        "requires_confirmation": response.requires_confirmation,
                        "important_message": response.important_message,
                        "full_result": MessageToDict(response.full_result) if response.is_final else None
                    }
                    if response.status_update.startswith("__RESPONDER__:"):
                        current_responder = response.status_update.split(":")[1]
                    resp_dict['responder'] = current_responder
                    await websocket.send_json(resp_dict)
            except asyncio.CancelledError:
                pass
            except grpc.aio.AioRpcError as e:
                # Suppress cancellation / unavailable tracebacks
                if e.code() not in (grpc.StatusCode.CANCELLED, grpc.StatusCode.UNAVAILABLE):
                    import traceback
                    traceback.print_exc()
            except Exception as e:
                import traceback
                traceback.print_exc()
            finally:
                await input_queue.put(None)

        try:
            await asyncio.gather(read_from_websocket(), write_to_websocket())
        except WebSocketDisconnect:
            pass
        except Exception as e:
            pass
        finally:
            if websocket.client_state.name != "DISCONNECTED":
                try:
                    await websocket.close()
                except RuntimeError:
                    pass

from urllib.parse import parse_qs

async def resolve_dynamic_node(node_id: str, channel: grpc.aio.Channel, websocket: WebSocket = None) -> tuple[str, str]:
    """Resolves dynamic nodes (like aws-console) by calling the remote plugin service. Returns (actual_id, params_json)."""
    if node_id.startswith("aws-console:"):
        if websocket:
            try:
                await websocket.send_bytes(b"\r\n\x1b[36m[Command Center] Authorizing AWS EC2 Serial Console... pushing SSH key...\x1b[0m\r\n")
            except Exception:
                pass
                
        parts = node_id.split(":", 1)[1]
        instance_part, query_part = parts.split("?", 1) if "?" in parts else (parts, "")
        query = parse_qs(query_part)
        
        args_dict = {
            "command": "console",
            "__func_name__": "handle_console_command",
            "identifier": instance_part,
            "region": query.get("region", ["us-east-1"])[0],
            "profile": query.get("profile", [""])[0],
            "port": 0,
            "verify_ssl": True
        }
        
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        req = remote_plugin_pb2.PluginInvokeRequest(
            name="aws", 
            args_json=json.dumps(args_dict)
        )
        
        output = ""
        try:
            async for chunk in stub.invoke_plugin(req):
                output += chunk.text
        except Exception as e:
            raise Exception(f"Failed to invoke AWS plugin via gRPC: {e}")
            
        for line in output.split('\n'):
            try:
                data = json.loads(line)
                if "error" in data:
                    raise Exception(data["error"])
                if "__interact__" in data:
                    if websocket:
                        try:
                            await websocket.send_bytes(b"\x1b[32m[Command Center] Authorized successfully. Connecting...\x1b[0m\r\n")
                        except Exception:
                            pass
                    return "dynamic", json.dumps(data["__interact__"])
            except json.JSONDecodeError:
                pass
                
        raise Exception(f"Plugin did not return connection parameters.\nPlugin Output: {output}")

    elif node_id.startswith("aws-ssm:"):
        if websocket:
            try:
                await websocket.send_bytes(b"\r\n\x1b[36m[Command Center] Initiating AWS SSM Session...\x1b[0m\r\n")
            except Exception:
                pass
                
        parts = node_id.split(":", 1)[1]
        instance_part, query_part = parts.split("?", 1) if "?" in parts else (parts, "")
        query = parse_qs(query_part)
        
        args_dict = {
            "command": "ssm",
            "__func_name__": "handle_ssm_command",
            "identifier": instance_part,
            "region": query.get("region", ["us-east-1"])[0],
            "profile": query.get("profile", [""])[0],
            "verify_ssl": True
        }
        
        stub = remote_plugin_pb2_grpc.RemotePluginServiceStub(channel)
        req = remote_plugin_pb2.PluginInvokeRequest(
            name="aws", 
            args_json=json.dumps(args_dict)
        )
        
        output = ""
        try:
            async for chunk in stub.invoke_plugin(req):
                output += chunk.text
        except Exception as e:
            raise Exception(f"Failed to invoke AWS plugin via gRPC: {e}")
            
        for line in output.split('\n'):
            try:
                data = json.loads(line)
                if "error" in data:
                    raise Exception(data["error"])
                if "__interact__" in data:
                    if websocket:
                        try:
                            await websocket.send_bytes(b"\x1b[32m[Command Center] Connecting...\x1b[0m\r\n")
                        except Exception:
                            pass
                    return "dynamic", json.dumps(data["__interact__"])
            except json.JSONDecodeError:
                pass
                
        raise Exception(f"Plugin did not return connection parameters.\nPlugin Output: {output}")
        
    return node_id, None

# --- SHARED TERMINAL MANAGER ---
class SharedTerminalManager:
    def __init__(self):
        self.sessions = {}
        self.lock = asyncio.Lock()

    async def get_or_create_session(self, session_id: str, node_id: str):
        key = f"{session_id}::{node_id}"
        async with self.lock:
            if key not in self.sessions:
                channel = grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS)
                stub = connpy_pb2_grpc.NodeServiceStub(channel)
                print(f"Starting shared gRPC call for {node_id}")
                input_queue = asyncio.Queue()
                
                async def request_generator():
                    try:
                        resolved_id, params_json = await resolve_dynamic_node(node_id, channel)
                        print(f"Generator yielding initial request for {resolved_id}")
                        if params_json:
                            yield connpy_pb2.InteractRequest(id=resolved_id, cols=80, rows=24, connection_params_json=params_json)
                        else:
                            yield connpy_pb2.InteractRequest(id=resolved_id, cols=80, rows=24)
                        while True:
                            data = await input_queue.get()
                            if data is None: break
                            if isinstance(data, connpy_pb2.InteractRequest):
                                yield data
                            elif isinstance(data, str):
                                try:
                                    import json
                                    payload = json.loads(data)
                                    if payload.get("type") == "copilot_question":
                                        yield connpy_pb2.InteractRequest(
                                            copilot_question=payload.get("question", ""),
                                            copilot_context_buffer=payload.get("context_buffer", ""),
                                            copilot_node_info_json=payload.get("node_info_json", "")
                                        )
                                    elif payload.get("type") == "copilot_action":
                                        yield connpy_pb2.InteractRequest(
                                            copilot_action=payload.get("action", "")
                                        )
                                except: pass
                                continue
                            yield connpy_pb2.InteractRequest(stdin_data=data)
                    except Exception as e:
                        # Error will be caught by the broadcast task
                        pass

                print(f"Creating shared terminal session for {key}")
                call = stub.interact_node(request_generator())
                
                session = {
                    'clients': set(),
                    'input_queue': input_queue,
                    'history': bytearray(),
                    'channel': channel,
                    'call': call,
                    'task': None
                }
                
                async def broadcast_task():
                    try:
                        async for response in call:
                            if response.stdout_data:
                                session['history'].extend(response.stdout_data)
                                if len(session['history']) > 50000:
                                    session['history'] = session['history'][-50000:]
                                
                                dead_clients = set()
                                for client in session['clients']:
                                    try:
                                        await client.send_bytes(response.stdout_data)
                                    except Exception:
                                        dead_clients.add(client)
                                for c in dead_clients:
                                    session['clients'].remove(c)
                            
                            # Handle Copilot messages in shared session
                            import json
                            copilot_payload = None
                            if response.copilot_prompt:
                                copilot_payload = {
                                    "type": "copilot_prompt",
                                    "node_info": json.loads(response.copilot_node_info_json) if response.copilot_node_info_json else {},
                                    "extra_info": json.loads(response.copilot_response_json) if response.copilot_response_json else {}
                                }
                            elif response.copilot_stream_chunk:
                                copilot_payload = {
                                    "type": "copilot_stream_chunk",
                                    "chunk": response.copilot_stream_chunk
                                }
                            elif response.copilot_response_json:
                                copilot_payload = {
                                    "type": "copilot_response_json",
                                    "data": json.loads(response.copilot_response_json)
                                }
                            elif response.copilot_injected_command:
                                copilot_payload = {
                                    "type": "copilot_injected_command",
                                    "command": response.copilot_injected_command
                                }
                            
                            if copilot_payload:
                                dead_clients = set()
                                for client in session['clients']:
                                    try:
                                        await client.send_json(copilot_payload)
                                    except Exception:
                                        dead_clients.add(client)
                                for c in dead_clients:
                                    session['clients'].remove(c)
                    except Exception as e:
                        print(f"Error in shared terminal {key}: {e}")
                        error_msg = f"\r\n\x1b[31;1m[SHARED SESSION ERROR]\x1b[0m\r\n\x1b[31m{str(e)}\x1b[0m\r\n"
                        for client in session['clients']:
                            try:
                                await client.send_bytes(error_msg.encode())
                            except Exception:
                                pass
                    finally:
                        await self.cleanup_session(session_id, node_id)
                        
                session['task'] = asyncio.create_task(broadcast_task())
                self.sessions[key] = session
            return self.sessions[key]

    async def cleanup_session(self, session_id: str, node_id: str):
        key = f"{session_id}::{node_id}"
        async with self.lock:
            if key in self.sessions:
                session = self.sessions[key]
                await session['input_queue'].put(None)
                if session['task'] and session['task'] is not asyncio.current_task():
                    session['task'].cancel()
                await session['channel'].close()
                del self.sessions[key]

shared_terminal_manager = SharedTerminalManager()

from urllib.parse import unquote

@app.websocket("/ws/terminal/{node_id}")
async def websocket_endpoint(websocket: WebSocket, node_id: str, session_id: str = Query(None)):
    node_id = unquote(node_id)
    if websocket.query_params.get("api_key") != API_KEY:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    
    if session_id:
        session = await shared_terminal_manager.get_or_create_session(session_id, node_id)
        session['clients'].add(websocket)
        
        if session['history']:
            try:
                await websocket.send_bytes(session['history'])
            except Exception:
                pass
                
        try:
            while True:
                msg = await websocket.receive()
                if "bytes" in msg:
                    await session['input_queue'].put(msg["bytes"])
                elif "text" in msg:
                    # Echo to other clients for co-op visibility or just forward to gRPC
                    try:
                        import json
                        data = json.loads(msg["text"])
                        if data.get("type") in ("copilot_question", "copilot_action"):
                            # Wrap in custom object that shared generator can distinguish
                            await session['input_queue'].put(msg["text"])
                    except: pass
        except WebSocketDisconnect:
            pass
        except Exception as e:
            import traceback
            traceback.print_exc()
        finally:
            if websocket in session['clients']:
                session['clients'].remove(websocket)
            if not session['clients']:
                await shared_terminal_manager.cleanup_session(session_id, node_id)
            if websocket.client_state.name != "DISCONNECTED":
                try:
                    await websocket.close()
                except Exception:
                    pass
        return
    
    # Private session
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.NodeServiceStub(channel)
        input_queue = asyncio.Queue()
        
        async def request_generator():
            try:
                resolved_id, params_json = await resolve_dynamic_node(node_id, channel, websocket)
                if params_json:
                    yield connpy_pb2.InteractRequest(id=resolved_id, cols=80, rows=24, connection_params_json=params_json)
                else:
                    yield connpy_pb2.InteractRequest(id=resolved_id, cols=80, rows=24)
                while True:
                    data = await input_queue.get()
                    if data is None:
                        break
                    if isinstance(data, connpy_pb2.InteractRequest):
                        yield data
                    else:
                        yield connpy_pb2.InteractRequest(stdin_data=data)
            except Exception as e:
                error_msg = f"\r\n\x1b[31;1m[SYSTEM ERROR]\x1b[0m\r\n\x1b[31m{str(e)}\x1b[0m\r\n"
                try:
                    await websocket.send_bytes(error_msg.encode())
                except Exception:
                    pass

        try:
            call = stub.interact_node(request_generator())
            
            async def read_from_websocket():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg:
                            await input_queue.put(msg["bytes"])
                        elif "text" in msg:
                            try:
                                import json
                                data = json.loads(msg["text"])
                                if data.get("type") == "copilot_question":
                                    await input_queue.put(connpy_pb2.InteractRequest(
                                        copilot_question=data.get("question", ""),
                                        copilot_context_buffer=data.get("context_buffer", ""),
                                        copilot_node_info_json=data.get("node_info_json", "")
                                    ))
                                elif data.get("type") == "copilot_action":
                                    await input_queue.put(connpy_pb2.InteractRequest(
                                        copilot_action=data.get("action", "")
                                    ))
                            except Exception as e:
                                print(f"Error parsing Copilot JSON: {e}")
                except WebSocketDisconnect:
                    await input_queue.put(None)
                except Exception:
                    await input_queue.put(None)

            async def write_to_websocket():
                try:
                    async for response in call:
                        if response.stdout_data:
                            await websocket.send_bytes(response.stdout_data)
                        
                        # Handle Copilot messages
                        import json
                        copilot_payload = None
                        if response.copilot_prompt:
                            copilot_payload = {
                                "type": "copilot_prompt",
                                "node_info": json.loads(response.copilot_node_info_json) if response.copilot_node_info_json else {},
                                "extra_info": json.loads(response.copilot_response_json) if response.copilot_response_json else {}
                            }
                        elif response.copilot_stream_chunk:
                            copilot_payload = {
                                "type": "copilot_stream_chunk",
                                "chunk": response.copilot_stream_chunk
                            }
                        elif response.copilot_response_json:
                            copilot_payload = {
                                "type": "copilot_response_json",
                                "data": json.loads(response.copilot_response_json)
                            }
                        elif response.copilot_injected_command:
                            copilot_payload = {
                                "type": "copilot_injected_command",
                                "command": response.copilot_injected_command
                            }
                        
                        if copilot_payload:
                            await websocket.send_json(copilot_payload)
                except grpc.aio.AioRpcError as e:
                    error_msg = f"\r\n\x1b[31;1m[CONNECTION ERROR]\x1b[0m\r\n\x1b[31m{e.details()}\x1b[0m\r\n"
                    await websocket.send_bytes(error_msg.encode())
                except Exception as e:
                    error_msg = f"\r\n\x1b[31;1m[SYSTEM ERROR]\x1b[0m\r\n\x1b[31m{str(e)}\x1b[0m\r\n"
                    await websocket.send_bytes(error_msg.encode())

            await asyncio.gather(read_from_websocket(), write_to_websocket())
            
        except Exception as e:
            print(f"Error in private gRPC session: {e}")
        finally:
            if websocket.client_state.name != "DISCONNECTED":
                try:
                    await websocket.close()
                except Exception:
                    pass

if __name__ == "__main__":
    import uvicorn
    
from google.protobuf.struct_pb2 import Struct
def dict_to_struct(d):
    s = Struct()
    s.update(d)
    return s

@app.websocket("/ws/playbook")
async def playbook_websocket_endpoint(websocket: WebSocket, api_key: str = Query(None)):
    if api_key != API_KEY:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    
    channel = None
    try:
        data = await websocket.receive_json()
        playbook = data.get("playbook")
        if not playbook:
            await websocket.send_json({"type": "error", "data": "No playbook data received."})
            await websocket.close()
            return

        async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
            exec_stub = connpy_pb2_grpc.ExecutionServiceStub(channel)
            
            tasks = playbook.get("tasks", [])
            if not tasks:
                await websocket.send_json({"type": "error", "data": "Playbook has no tasks."})
                return

            for task_index, task in enumerate(tasks):
                task_name = task.get("name", f"Task {task_index + 1}")
                action = task.get("action", "run")
                nodes = task.get("nodes", [])
                commands = task.get("commands", [])
                variables = task.get("variables", {})
                expected = task.get("expected", task.get("expected_output", []))
                timeout = task.get("timeout", 10)
                parallel = task.get("parallel", 10)
                prompt = task.get("prompt", "")
                folder = task.get("folder", "")
                
                if not nodes:
                    await websocket.send_json({"type": "header", "data": f"--- SKIPPING {task_name.upper()} (NO NODES) ---"})
                    continue

                await websocket.send_json({"type": "header", "data": f"--- STARTING {task_name.upper()} ---"})
                
                try:
                    if action == "run":
                        req = connpy_pb2.RunRequest(
                            nodes=nodes,
                            commands=commands,
                            vars=dict_to_struct(variables),
                            parallel=parallel,
                            timeout=timeout,
                            prompt=prompt,
                            folder=folder,
                            name=task_name
                        )
                        async for response in exec_stub.run_commands(req):
                            await websocket.send_json({"type": "output", "node": response.unique_id, "data": response.output, "status": response.status})
                    elif action == "test":
                        expected_list = [expected] if isinstance(expected, str) else list(expected) if expected else []
                        req = connpy_pb2.TestRequest(
                            nodes=nodes,
                            commands=commands,
                            expected=expected_list,
                            vars=dict_to_struct(variables),
                            parallel=parallel,
                            timeout=timeout,
                            prompt=prompt,
                            folder=folder,
                            name=task_name
                        )
                        async for response in exec_stub.test_commands(req):
                            result_dict = MessageToDict(response.test_result) if response.test_result else {}
                            await websocket.send_json({"type": "output", "node": response.unique_id, "data": response.output, "status": response.status, "result": result_dict})
                    else:
                        await websocket.send_json({"type": "error", "data": f"Unknown action type: {action}"})
                except Exception as e:
                    await websocket.send_json({"type": "error", "data": f"Execution Error in '{task_name}': {str(e)}"})
                    
            await websocket.send_json({"type": "header", "data": "--- PLAYBOOK COMPLETED ---"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "data": f"System Level Error: {str(e)}"})
        except:
            pass
    finally:
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()

@app.post("/api/run", dependencies=[Depends(verify_api_key)])
async def api_run_commands(request: Request):
    data = await request.json()
    nodes = data.get("nodes", [])
    commands = data.get("commands", [])
    variables = data.get("variables", {})
    timeout = data.get("timeout", 10)
    
    if not nodes or not commands:
        return {"error": "nodes and commands are required"}

    results = {}
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.ExecutionServiceStub(channel)
        req = connpy_pb2.RunRequest(
            nodes=nodes,
            commands=commands,
            vars=dict_to_struct(variables),
            parallel=10,
            timeout=timeout
        )
        async for response in stub.run_commands(req):
            results[response.unique_id] = {
                "output": response.output,
                "status": response.status
            }
    return results

@app.post("/api/test", dependencies=[Depends(verify_api_key)])
async def api_test_commands(request: Request):
    data = await request.json()
    nodes = data.get("nodes", [])
    commands = data.get("commands", [])
    expected = data.get("expected", [])
    variables = data.get("variables", {})
    timeout = data.get("timeout", 10)
    
    if not nodes or not commands or not expected:
        return {"error": "nodes, commands and expected are required"}

    if isinstance(expected, str):
        expected = [expected]

    results = {}
    async with grpc.aio.insecure_channel(GRPC_SERVER_ADDRESS) as channel:
        stub = connpy_pb2_grpc.ExecutionServiceStub(channel)
        req = connpy_pb2.TestRequest(
            nodes=nodes,
            commands=commands,
            expected=expected,
            vars=dict_to_struct(variables),
            parallel=10,
            timeout=timeout
        )
        async for response in stub.test_commands(req):
            results[response.unique_id] = {
                "output": response.output,
                "status": response.status,
                "result": MessageToDict(response.test_result) if response.test_result else {}
            }
    return results

from fastapi.staticfiles import StaticFiles
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/dist"))
if os.path.exists(frontend_dist) and not os.environ.get("COMMAND_CENTER_DEV"):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
