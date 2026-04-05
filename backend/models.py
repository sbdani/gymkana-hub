from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class Tournament(Base):
    __tablename__ = "tournaments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    num_groups = Column(Integer)
    num_challenges = Column(Integer)
    # Nueva columna para guardar la URL de la imagen del mapa en la nube
    map_url = Column(String, nullable=True)

    groups = relationship("Group", back_populates="tournament")
    challenges = relationship("Challenge", back_populates="tournament")

class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    is_active = Column(Boolean, default=True)
    total_score = Column(Integer, default=0)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    
    tournament = relationship("Tournament", back_populates="groups")

class Challenge(Base):
    __tablename__ = "challenges"
    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer)
    x_pos = Column(Float, nullable=True)
    y_pos = Column(Float, nullable=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    
    tournament = relationship("Tournament", back_populates="challenges")

class Score(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    challenge_id = Column(Integer, ForeignKey("challenges.id"))
    points = Column(Integer)
