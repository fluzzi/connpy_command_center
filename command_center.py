#!/usr/bin/env python
import argparse
import sys
import os



import subprocess
import signal
import time

def get_pid_file():
    return "/tmp/command_center.pid"

def get_running_pid():
    pid_file = get_pid_file()
    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r") as f:
                pid = int(f.read().strip())
            os.kill(pid, 0)
            return pid
        except (OSError, ProcessLookupError, ValueError):
            if os.path.exists(pid_file):
                try: os.remove(pid_file)
                except: pass
    return None

def get_command_center_path(args=None, config=None):
    if args and getattr(args, 'path', None):
        return args.path
    if config:
        path = config.get("command_center_path")
        if path:
            return path
    # Fallback to the directory of this script
    return os.path.dirname(os.path.abspath(__file__))

def run_command_center(path, dev=False, port=8000, grpc_target="127.0.0.1:8048"):
    os.environ["CONNPY_GRPC_SERVER"] = grpc_target
    
    middleware_dir = os.path.join(path, "middleware")
    frontend_dir = os.path.join(path, "frontend")
    
    if not os.path.exists(middleware_dir):
        print(f"Error: Middleware directory not found at {middleware_dir}")
        sys.exit(1)
        
    sys.path.insert(0, middleware_dir)

    processes = []
    
    if dev:
        os.environ["COMMAND_CENTER_DEV"] = "1"
        env = os.environ.copy()
        env["VITE_API_URL"] = f"http://localhost:{port}"
        frontend_proc = subprocess.Popen(["npm", "run", "dev"], cwd=frontend_dir, env=env)
        processes.append(frontend_proc)
        
    def run_uvicorn():
        import uvicorn
        from main import app
        uvicorn.run(app, host="0.0.0.0", port=port)

    try:
        run_uvicorn()
    except KeyboardInterrupt:
        pass
    finally:
        for p in processes:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()

def build_command_center(path):
    frontend_dir = os.path.join(path, "frontend")
    print(f"Building frontend in {frontend_dir}...")
    subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
    subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)
    print("Build complete.")

# ---------------------------------------------------------
# PLUGIN PARSER & ENTRYPOINT
# ---------------------------------------------------------

class Parser:
    def __init__(self):
        self.parser = argparse.ArgumentParser(description="Command Center Plugin")
        self.parser.add_argument("--set-path", help="Set the default absolute path to the command_center repository")
        self.parser.add_argument("--path", help="The absolute path to the command_center repository")
        self.parser.add_argument("-p", "--port", type=int, default=8000, help="Port for the Command Center API")
        self.parser.add_argument("-g", "--grpc-target", default="127.0.0.1:8048", help="The connpy gRPC host and port")
        self.parser.add_argument("--dev", action="store_true", help="Runs the Vite frontend development server")
        self.parser.add_argument("--build", action="store_true", help="Builds the frontend dist folder and exits")
        self.parser.add_argument("--start", action="store_true", help="Start the Command Center in the background")
        self.parser.add_argument("--stop", action="store_true", help="Stop the background Command Center instance")

class Entrypoint:
    def __init__(self, args, parser, connapp):
        self.connapp = connapp
        
        if args.stop:
            pid = get_running_pid()
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                    pid_file = get_pid_file()
                    if os.path.exists(pid_file): os.remove(pid_file)
                    connapp._service_logger("success", f"Command Center (PID {pid}) stopped.")
                except Exception as e:
                    connapp._service_logger("error", f"Failed to stop Command Center: {e}")
            else:
                connapp._service_logger("info", "Command Center is not running.")
            return

        if args.set_path:
            path = os.path.abspath(args.set_path)
            if not os.path.exists(path):
                connapp._service_logger("error", f"Path does not exist: {path}")
                sys.exit(1)
            connapp.services.config_svc.update_setting("command_center_path", path)
            connapp._service_logger("success", f"Command Center path updated to: {path}")
            return
            
        path = get_command_center_path(args, connapp.services.config_svc.get_settings())
        
        if not os.path.exists(path):
            connapp._service_logger("error", f"Command Center not found at {path}. Use --set-path to configure it.")
            sys.exit(1)

        if args.start:
            pid = get_running_pid()
            if pid:
                connapp._service_logger("info", f"Command Center is already running (PID {pid}).")
                return
            
            cc_script = os.path.join(path, "command_center.py")
            cmd = [sys.executable, cc_script, "-p", str(args.port), "--grpc-target", args.grpc_target]
            if args.dev: cmd.append("--dev")
            
            kwargs_popen = {
                "env": os.environ.copy(),
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
                "start_new_session": True
            }
            
            proc = subprocess.Popen(cmd, **kwargs_popen)
            pid_file = get_pid_file()
            with open(pid_file, "w") as f:
                f.write(str(proc.pid))
            
            connapp._service_logger("success", f"Command Center started in background (PID {proc.pid})")
            return

        if args.build:
            build_command_center(path)
            return

        run_command_center(path, dev=args.dev, port=args.port, grpc_target=args.grpc_target)


def _connpy_tree(info=None):
    """Declarative completion tree for the command_center plugin."""
    return {
        "--set-path": {"__extra__": lambda w: get_cwd(w, "--set-path", folderonly=True)},
        "--path": {"__extra__": lambda w: get_cwd(w, "--path", folderonly=True)},
        "-p": {"__extra__": lambda w: []},
        "--port": {"__extra__": lambda w: []},
        "-g": {"__extra__": lambda w: []},
        "--grpc-target": {"__extra__": lambda w: []},
        "--dev": {"__extra__": lambda w: []},
        "--build": {"__extra__": lambda w: []},
        "--start": {"__extra__": lambda w: []},
        "--stop": {"__extra__": lambda w: []},
    }


# ---------------------------------------------------------
# API LIFECYCLE HOOKS (VIA PRELOAD)
# ---------------------------------------------------------

class Preload:
    def __init__(self, connapp):
        self._cc_instance_running = False
        self._started_by_us = False
        try:
            import sys
            MethodHook = sys.modules["connpy.hooks"].MethodHook
            SystemServiceClass = connapp.services.system.__class__
            import functools

            # Helper to safely wrap if not already wrapped
            def ensure_hook(method):
                if not isinstance(method, MethodHook):
                    return MethodHook(method)
                return method

            SystemServiceClass.start_api = ensure_hook(SystemServiceClass.start_api)
            SystemServiceClass.debug_api = ensure_hook(SystemServiceClass.debug_api)
            SystemServiceClass.stop_api = ensure_hook(SystemServiceClass.stop_api)

            def execute_start_cc(service_instance, dev=False, port=None):
                # Check if already running
                pid = get_running_pid()
                if pid:
                    self._cc_instance_running = True
                    return

                if self._cc_instance_running:
                    return

                settings = service_instance.config.config
                cc_path = settings.get("command_center_path")
                if cc_path and os.path.exists(cc_path):
                    cc_script = os.path.join(cc_path, "command_center.py")
                    if os.path.exists(cc_script):
                        mode = " (Dev Mode)" if dev else ""
                        grpc_target = f"127.0.0.1:{port or 8048}"
                        cc_port = settings.get("command_center_port", 8000)
                        
                        connapp._service_logger("info", f"Starting Command Center{mode} on port {cc_port} (gRPC: {grpc_target}) from {cc_path}...")
                        cmd = [sys.executable, cc_script, "-p", str(cc_port), "--grpc-target", grpc_target]
                        if dev:
                            cmd.append("--dev")
                            
                        kwargs_popen = {"env": os.environ.copy()}
                        kwargs_popen["env"]["PYTHONUNBUFFERED"] = "1"
                        
                        if not dev:
                            kwargs_popen["stdout"] = subprocess.DEVNULL
                            kwargs_popen["stderr"] = subprocess.DEVNULL
                            kwargs_popen["start_new_session"] = True
                        else:
                            connapp._service_logger("info", "Vite Frontend will run on http://localhost:5173")
                            connapp._service_logger("info", "Uvicorn Middleware will run on http://localhost:8000")

                        proc = subprocess.Popen(cmd, **kwargs_popen)
                        self._cc_instance_running = True
                        self._started_by_us = True
                        pid_file = get_pid_file()
                        with open(pid_file, "w") as f:
                            f.write(str(proc.pid))
                else:
                    connapp._service_logger("warning", "command_center_path not configured or missing, skipping Command Center auto-start.")

            def pre_debug_cc(*args, **kwargs):
                service_instance = args[0]
                port = kwargs.get('port') if 'port' in kwargs else (args[1] if len(args) > 1 else 8048)
                execute_start_cc(service_instance, dev=True, port=port)
                return args, kwargs

            def post_start_cc(*args, **kwargs):
                # If we are already running (likely from debug hook), don't start prod mode
                if self._cc_instance_running:
                    return kwargs.get("result")
                    
                service_instance = args[0]
                port = kwargs.get('port') if 'port' in kwargs else (args[1] if len(args) > 1 else 8048)
                execute_start_cc(service_instance, dev=False, port=port)
                return kwargs.get("result")

            def stop_cc_actual():
                pid = get_running_pid()
                if pid:
                    try:
                        os.kill(pid, signal.SIGTERM)
                        pid_file = get_pid_file()
                        if os.path.exists(pid_file): os.remove(pid_file)
                        connapp._service_logger("info", "Command Center stopped.")
                    except:
                        pass
                self._cc_instance_running = False

            def stop_cc_debug(*args, **kwargs):
                if getattr(self, "_started_by_us", False):
                    stop_cc_actual()
                return kwargs.get("result")

            def stop_cc_explicit(*args, **kwargs):
                stop_cc_actual()
                return kwargs.get("result")

            # Register hooks
            SystemServiceClass.start_api.register_post_hook(post_start_cc)
            SystemServiceClass.debug_api.register_pre_hook(pre_debug_cc)
            SystemServiceClass.debug_api.register_post_hook(stop_cc_debug)
            SystemServiceClass.stop_api.register_post_hook(stop_cc_explicit)

        except (KeyError, AttributeError, ImportError):
            # Not running within connpy context
            pass



if __name__ == "__main__":
    # Force local connpy workspace resolution for all imports
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../connpy")))
    
    parser = Parser().parser
    args = parser.parse_args()
    
    if args.stop:
        pid = get_running_pid()
        if pid:
            try:
                os.kill(pid, signal.SIGTERM)
                pid_file = get_pid_file()
                if os.path.exists(pid_file): os.remove(pid_file)
                print(f"Command Center (PID {pid}) stopped.")
            except Exception as e:
                print(f"Failed to stop Command Center: {e}")
        else:
            print("Command Center is not running.")
        sys.exit(0)

    if args.set_path:
        print("Error: --set-path is only available when running as a connpy plugin.")
        sys.exit(1)
        
    path = get_command_center_path(args)
    if not os.path.exists(path):
        print(f"Command Center not found at {path}.")
        sys.exit(1)

    if args.start:
        pid = get_running_pid()
        if pid:
            print(f"Command Center is already running (PID {pid}).")
            sys.exit(0)
        
        cc_script = os.path.abspath(__file__)
        cmd = [sys.executable, cc_script, "-p", str(args.port), "--grpc-target", args.grpc_target]
        if args.dev: cmd.append("--dev")
        
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        pid_file = get_pid_file()
        with open(pid_file, "w") as f:
            f.write(str(proc.pid))
        print(f"Command Center started in background (PID {proc.pid})")
        sys.exit(0)
        
    if args.build:
        build_command_center(path)
        sys.exit(0)
        
    run_command_center(path, dev=args.dev, port=args.port, grpc_target=args.grpc_target)
