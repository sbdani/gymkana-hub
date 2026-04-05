import uvicorn
import os
import sys
import webbrowser
import threading
import time
import socket
import subprocess
import re

# Añadir el directorio actual al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def start_tunnel():
    """Túnel SSH con múltiples servidores y escucha de larga duración."""
    tunnels = [
        {"name": "Localhost.run", "cmd": ["ssh", "-R", "80:localhost:8000", "nokey@localhost.run"], "regex": r"https?://[a-zA-Z0-9.-]+\.lhr\.(life|rocks|run)"},
        {"name": "Serveo", "cmd": ["ssh", "-R", "80:localhost:8000", "serveo.net"], "regex": r"https?://[a-zA-Z0-9.-]+\.serveo\.net"},
        {"name": "Pinggy", "cmd": ["ssh", "-R", "80:localhost:8000", "-o", "StrictHostKeyChecking=no", "a.pinggy.io"], "regex": r"https?://[a-zA-Z0-9.-]+\.pinggy\.(link|mobi|io)"}
    ]

    for tunnel in tunnels:
        print(f"\n📡 INTENTANDO CANAL GLOBAL ({tunnel['name']})...")
        try:
            p = subprocess.Popen(tunnel['cmd'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for i in range(60):
                line = p.stdout.readline()
                if not line: break
                if i < 5 or "http" in line.lower(): 
                   print(f"   > {line.strip()}")
                match = re.search(tunnel['regex'], line)
                if match:
                    public_url = match.group(0)
                    print("\n" + "*"*60)
                    print(f" ✅ ¡CONEXIÓN GLOBAL ACTIVA!")
                    print(f" 🔗 DIRECCIÓN: {public_url}")
                    print("*"*60)
                    # Abrimos en PC
                    threading.Timer(2, lambda: webbrowser.open(public_url + "/static/index.html")).start()
                    return
            p.terminate()
        except: continue

    print("\n❌ NO SE HA PODIDO CREAR UN TÚNEL DE INTERNET.")

if __name__ == "__main__":
    local_ip = get_local_ip()
    os.system('color 0a') # Color verde Matrix
    
    print("\n" + "╔" + "═"*58 + "╗")
    print("║" + " "*18 + "GYMKANA HUB - ESTADO DE RED" + " "*19 + "║")
    print("╠" + "═"*58 + "╣")
    print(f"║ 🚩 TU IP DE WIFI (MÓVILES): http://{local_ip}:8000 ║")
    print(f"║ 🔑 PIN DE ACCESO: 2412                                 ║")
    print("╚" + "═"*58 + "╝")
    
    print("\n⚠️  ¡ATENCIÓN! Si el móvil no conecta a esa IP:")
    print("   1. Abre PowerShell como Administrador.")
    print(f"   2. Pega este comando: netsh advfirewall firewall add rule name=\"Gymkana\" dir=in action=allow protocol=TCP localport=8000")
    
    # Iniciar túnel de Internet de fondo
    threading.Thread(target=start_tunnel, daemon=True).start()
    
    # Lanzar servidor FastAPI
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False, log_level="warning")
