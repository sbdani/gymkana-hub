from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import os
import shutil
import socket
import base64

from backend import models, database
from backend.database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# ============================================
# VARIABLES DE ENTORNO PARA PINs DE SEGURIDAD
# ============================================
ADMIN_PIN = os.getenv("ADMIN_PIN", "2412")
COLAB_PIN = os.getenv("COLAB_PIN", "3333")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
MAPS_DIR = os.path.join(UPLOAD_DIR, "maps")
os.makedirs(MAPS_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "frontend")), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

@app.get("/network-info/")
def network_info():
    return {"local_ip": get_local_ip(), "port": 8000}

@app.post("/tournaments/")
def create_tournament(name: str = Form(...), num_groups: int = Form(...), num_challenges: int = Form(...), db: Session = Depends(get_db)):
    try:
        existing = db.query(models.Tournament).filter(models.Tournament.name == name).first()
        if existing: raise HTTPException(status_code=400, detail=f"Nombre ya en uso.")
        tourney = models.Tournament(name=name, num_groups=int(num_groups), num_challenges=int(num_challenges))
        db.add(tourney)
        db.commit()
        db.refresh(tourney)
        for i in range(1, tourney.num_challenges + 1):
            db.add(models.Challenge(number=i, tournament_id=tourney.id))
        db.commit()
        return tourney
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tournaments/")
def list_tournaments(db: Session = Depends(get_db)):
    return db.query(models.Tournament).all()

@app.get("/tournaments/{tid}")
def get_tournament(tid: int, db: Session = Depends(get_db)):
    tourney = db.query(models.Tournament).filter(models.Tournament.id == tid).first()
    if not tourney: raise HTTPException(status_code=404)
    return tourney

# --- CARGAR GRUPOS ---
@app.get("/tournaments/{tid}/groups/")
def get_groups(tid: int, challenge_num: int = None, active_only: bool = True, db: Session = Depends(get_db)):
    groups = db.query(models.Group).filter(models.Group.tournament_id == tid)
    if active_only: groups = groups.filter(models.Group.is_active == True)
    results = groups.all()
    cid = None
    if challenge_num:
        ch = db.query(models.Challenge).filter(models.Challenge.tournament_id == tid, models.Challenge.number == challenge_num).first()
        if ch: cid = ch.id
    for g in results:
        total = db.query(func.sum(models.Score.points)).filter(models.Score.group_id == g.id).scalar() or 0
        g.total_score = total
        g.current_points = 0
        if cid:
            s = db.query(models.Score).filter(models.Score.group_id == g.id, models.Score.challenge_id == cid).first()
            if s: g.current_points = s.points
    results.sort(key=lambda x: x.total_score, reverse=True)
    return results

# --- ACTUALIZAR URL DEL MAPA ---
@app.post("/tournaments/{tid}/map-url/")
def update_map_url(tid: int, url: str = Form(...), db: Session = Depends(get_db)):
    tourney = db.query(models.Tournament).filter(models.Tournament.id == tid).first()
    if not tourney: raise HTTPException(status_code=404)
    tourney.map_url = url
    db.commit()
    return {"status": "OK", "url": url}

@app.get("/tournaments/{tid}/audit/")
def get_audit(tid: int, db: Session = Depends(get_db)):
    scores = db.query(models.Score).join(models.Challenge).filter(models.Challenge.tournament_id == tid).all()
    return [{"group_id": s.group_id, "challenge_num": db.query(models.Challenge).filter(models.Challenge.id == s.challenge_id).first().number, "points": s.points} for s in scores]

@app.post("/tournaments/{tid}/upload-csv/")
async def upload_csv(tid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        tourney = db.query(models.Tournament).filter(models.Tournament.id == tid).first()
        if not tourney: raise HTTPException(status_code=404)
        contents = await file.read()
        raw_text = ""
        for encoding in ["utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "utf-8", "latin-1", "cp1252"]:
            try:
                raw_text = contents.decode(encoding)
                if raw_text: break
            except: continue
        lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
        names = []
        for l in lines[1:]:
            parts = l.split(',') if ',' in l else (l.split(';') if ';' in l else l.split('\t'))
            name = parts[0].strip().replace('"', '').replace("'", "")
            if name: names.append(name)
        db.query(models.Group).filter(models.Group.tournament_id == tid).delete()
        for idx, n in enumerate(names):
            db.add(models.Group(name=n, is_active=(idx < tourney.num_groups), tournament_id=tid))
        db.commit()
        return {"status": "OK", "count": len(names)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tournaments/{tid}/upload-map/")
async def upload_map(tid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    tourney = db.query(models.Tournament).filter(models.Tournament.id == tid).first()
    if not tourney: raise HTTPException(status_code=404)
    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")
    ext = "png"
    if file.filename and "." in file.filename:
        ext = file.filename.split(".")[-1]
    data_uri = f"data:image/{ext};base64,{b64}"
    tourney.map_url = data_uri
    db.commit()
    return {"filename": data_uri}

@app.post("/tournaments/{tid}/challenges/{num}/location/")
def update_location(tid: int, num: int, x: float = Form(...), y: float = Form(...), db: Session = Depends(get_db)):
    ch = db.query(models.Challenge).filter(models.Challenge.tournament_id == tid, models.Challenge.number == num).first()
    if not ch: raise HTTPException(status_code=404)
    ch.x_pos, ch.y_pos = x, y
    db.commit()
    return {"status": "OK"}

@app.get("/tournaments/{tid}/challenges/")
def get_challenges(tid: int, db: Session = Depends(get_db)):
    return db.query(models.Challenge).filter(models.Challenge.tournament_id == tid).all()

# ============================================
# NUEVO: ACTUALIZAR NOMBRE DE PRUEBA
# ============================================
@app.post("/tournaments/{tid}/challenges/{num}/name/")
def update_challenge_name(tid: int, num: int, name: str = Form(...), db: Session = Depends(get_db)):
    ch = db.query(models.Challenge).filter(
        models.Challenge.tournament_id == tid, 
        models.Challenge.number == num
    ).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Prueba no encontrada")
    ch.name = name
    db.commit()
    return {"status": "OK", "name": name}

@app.post("/score/")
def add_score(group_id: int = Form(...), challenge_id: int = Form(...), points: int = Form(...), db: Session = Depends(get_db)):
    score = db.query(models.Score).filter(models.Score.group_id == group_id, models.Score.challenge_id == challenge_id).first()
    if points == 0:
        if score:
            db.delete(score)
            db.commit()
        return {"status": "DELETED"}
        
    if score: score.points = points
    else: db.add(models.Score(group_id=group_id, challenge_id=challenge_id, points=points))
    db.commit()
    return {"status": "OK"}

@app.post("/reset-all/")
def reset_all(db: Session = Depends(get_db)):
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    return {"message": "Reset"}